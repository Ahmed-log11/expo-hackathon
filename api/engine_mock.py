"""
Mock of B's routing engine. Same function signatures B must deliver:

    plan(visitor_id, wishlist, start_time, end_time, start_point) -> Route dict
    next_stop(visitor_id) -> NextStop dict | None
    replan(visitor_id, constraints=None) -> Route dict
    crowd_snapshot(now) -> list of PavilionCrowd dicts

Shapes match contract/README.md. In C6, replace `from api import engine_mock as engine`
with B's module; nothing else in api/ should change.

Logic here is deliberately dumb: straight-line walking, greedy nearest-next ordering,
a fake wait curve. No balancing, no ledger.
"""
from __future__ import annotations

import json
import math
import random
from datetime import datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = json.loads((ROOT / "sim" / "pavilions.json").read_text(encoding="utf-8"))
POINTS = {p["id"]: p for p in SITE["places"]}                         # everything on the map
PAVILIONS = {k: p for k, p in POINTS.items() if p.get("has_queue")}   # queued: can be on a route
LANDMARKS = {k: p for k, p in POINTS.items() if not p.get("has_queue")}
HUB = "icon"           # centre of the site; routes between districts pass it
DEFAULT_START = "metro"

MIN_PER_GRID_UNIT = 0.15  # ~12 m per unit at ~80 m/min walking
_routes: dict[str, dict] = {}  # visitor_id -> current route
_rng = random.Random(42)


# ---------- helpers ----------
def _iso(t: datetime) -> str:
    return t.replace(microsecond=0).isoformat()


def _walk_min(a: str, b: str) -> int:
    pa, pb = POINTS[a], POINTS[b]
    return max(1, round(math.dist((pa["x"], pa["y"]), (pb["x"], pb["y"])) * MIN_PER_GRID_UNIT))


def _fake_wait(pid: str, t: datetime) -> int:
    """Popularity x time-of-day curve (peaks ~19:00) + a little noise."""
    p = PAVILIONS[pid]
    hour = t.hour + t.minute / 60
    curve = 0.4 + 0.6 * math.exp(-((hour - 19) ** 2) / 8)
    noise = (hash((pid, t.hour, t.minute // 10)) % 7) - 3
    return max(0, round(p["popularity"] * 12 * curve + noise))


def _path(a: str, b: str) -> list[str]:
    """Straight line via the Icon when crossing districts (B's walkway graph replaces this)."""
    da, db = POINTS[a].get("district"), POINTS[b].get("district")
    if da != db and "central" not in (da, db) and HUB not in (a, b):
        return [a, HUB, b]
    return [a, b]


def _status(wait: int) -> str:
    return "low" if wait < 15 else "medium" if wait < 40 else "high"


# ---------- crowd ----------
def crowd_snapshot(now: datetime) -> list[dict]:
    out = []
    for pid, p in PAVILIONS.items():
        wait = max(0, _fake_wait(pid, now) + _rng.randint(-2, 2))
        out.append({
            "pavilion_id": pid,
            "wait_min": wait,
            "queue_length": round(wait * p["capacity_per_hour"] / 60),
            "status": _status(wait),
        })
    return out


# ---------- routing ----------
def _build(visitor_id: str, wishlist: list[str], start_time: datetime, end_time: datetime,
           start_point: str, exclude: set[str] | None = None) -> dict:
    remaining = [w for w in dict.fromkeys(wishlist) if w in PAVILIONS and w not in (exclude or set())]
    stops, dropped = [], []
    here, t = start_point, start_time
    walk_total = wait_total = 0

    while remaining:
        nxt = min(remaining, key=lambda pid: _walk_min(here, pid) + _fake_wait(pid, t))
        remaining.remove(nxt)
        walk = _walk_min(here, nxt)
        arrive = t + timedelta(minutes=walk)
        wait = _fake_wait(nxt, arrive)
        visit = PAVILIONS[nxt]["avg_visit_min"]
        leave = arrive + timedelta(minutes=wait + visit)
        if leave > end_time:
            dropped.append(nxt)
            continue
        path = _path(here, nxt)
        stops.append({
            "order": len(stops) + 1,
            "pavilion_id": nxt,
            "walk_from_prev_min": walk,
            "arrive_at": _iso(arrive),
            "wait_min": wait,
            "visit_min": visit,
            "leave_at": _iso(leave),
            "path": path,
            "landmarks": [p for p in path[1:-1]],
        })
        walk_total += walk
        wait_total += wait
        here, t = nxt, leave

    route = {
        "visitor_id": visitor_id,
        "version": _routes.get(visitor_id, {}).get("version", 0) + 1,
        "generated_at": _iso(start_time),
        "start_point": start_point,
        "end_time": _iso(end_time),
        "stops": stops,
        "totals": {"walk_min": walk_total, "wait_min": wait_total, "stops": len(stops)},
        "feasibility": {"fits": len(stops), "requested": len(stops) + len(dropped), "dropped": dropped},
        "summary": None,
    }
    _routes[visitor_id] = route
    return route


def plan(visitor_id: str, wishlist: list[str], start_time: datetime, end_time: datetime,
         start_point: str = DEFAULT_START) -> dict:
    """wishlist is in priority order. If it doesn't fit, drop from the end, not the top."""
    keep = list(dict.fromkeys(w for w in wishlist if w in PAVILIONS))
    prev = _routes.get(visitor_id)
    while True:
        _routes.pop(visitor_id, None)
        if prev:
            _routes[visitor_id] = prev
        route = _build(visitor_id, keep, start_time, end_time, start_point)
        if not route["feasibility"]["dropped"] or len(keep) <= 1:
            break
        keep = keep[:-1]
    route["feasibility"]["requested"] = len(dict.fromkeys(wishlist))
    route["feasibility"]["dropped"] = [w for w in dict.fromkeys(wishlist)
                                      if w not in {s["pavilion_id"] for s in route["stops"]}]
    return route


def get_route(visitor_id: str) -> dict | None:
    return _routes.get(visitor_id)


def next_stop(visitor_id: str) -> dict | None:
    route = _routes.get(visitor_id)
    if not route or not route["stops"]:
        return None
    s = route["stops"][0]
    return {
        "visitor_id": visitor_id,
        "route_version": route["version"],
        "pavilion_id": s["pavilion_id"],
        "walk_min": s["walk_from_prev_min"],
        "wait_min": s["wait_min"],
        "arrive_at": s["arrive_at"],
        "path": s["path"],
        "landmarks": s["landmarks"],
        "remaining_stops": len(route["stops"]) - 1,
    }


def mark_left(visitor_id: str, pavilion_id: str) -> None:
    """Visitor finished a stop: drop it from the front of their route."""
    route = _routes.get(visitor_id)
    if route:
        route["stops"] = [s for s in route["stops"] if s["pavilion_id"] != pavilion_id]
        for i, s in enumerate(route["stops"], 1):
            s["order"] = i


def replan(visitor_id: str, constraints: dict | None = None, now: datetime | None = None) -> dict:
    """Mock: re-plan the remaining stops from the visitor's next stop's previous point."""
    route = _routes[visitor_id]
    remaining = [s["pavilion_id"] for s in route["stops"]]
    start_point = route["stops"][0]["path"][0] if route["stops"] else route["start_point"]
    exclude = set((constraints or {}).get("remove", []))
    remaining += (constraints or {}).get("add", [])
    return _build(visitor_id, remaining, now or datetime.fromisoformat(route["generated_at"]),
                  datetime.fromisoformat(route["end_time"]), start_point, exclude)
