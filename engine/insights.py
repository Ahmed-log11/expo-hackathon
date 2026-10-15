"""
Operator insights for the admin dashboard (admin/). Read-only: nothing here books, releases
or observes anything.

    record(now)          keep one wait snapshot per minute for the last 3 hours (memory only)
    backfill(now)        on an empty history, estimate the last 2 hours (marked estimated)
    series(now)          site average wait history + forecast + per-pavilion trend (GET /admin/history)
    events(now)          the alerts feed: went busy, calmed down, rising fast, crowd reports, offers
    pavilion(pid, now)   one pavilion in detail: its history, forecast, ledger and events
    facts(now, stats)    the numbers the AI briefing is written from (llm/insights.py)

The briefing must never invent numbers, so everything it may say is computed here: waits now,
30 minutes ago (from the history) and "normal for this hour" (the ML prior), the forecast for
the next 90 minutes, the ledger's routed arrivals against capacity, districts and offers.
"""
from __future__ import annotations

from collections import deque
from datetime import datetime, timedelta

from engine import routing
from engine.crowd_state import PERSIST_MIN, prior_wait
from engine.site import PAVILIONS, SITE

HISTORY_MIN = 180          # how much history to keep
SAMPLE_S = 60              # one snapshot per minute
COMPARE_MIN = 30           # "busier than 30 minutes ago"
COMPARE_TOLERANCE_MIN = 6  # accept a snapshot this close to the compare time
FORECAST_STEPS_MIN = (30, 60, 90)

RISE_MIN = 8               # a change smaller than this (minutes of wait) is noise
ABOVE_NORMAL_MIN = 10      # this much above the usual wait for the hour counts as unusual

BACKFILL_MIN = 120         # after a (re)start, estimate this much past...
BACKFILL_STEP_MIN = 5      # ...at this resolution
SERIES_FORECAST_MIN = range(0, 91, 10)

HIGH_MIN = 40              # "busy" (same line as crowd_snapshot's status)...
CALM_MIN = 35              # ...and back to normal only below this, so a wait hovering at 40 doesn't flap
FAST_RISE_MIN = 15         # "rising fast": the wait grew this much...
FAST_WINDOW_MIN = 15       # ...within this many minutes
FAST_REPEAT_MIN = 30       # and at most one such alert per pavilion per this long
EVENTS_MAX = 40

Sample = tuple[datetime, dict[str, int], bool]   # (time, wait per pavilion, estimated)
_history: deque[Sample] = deque(maxlen=HISTORY_MIN * 60 // SAMPLE_S)
# Reroute offers keep no send time once closed, so the recorder notes when the counter moves:
# (time, offers sent since the last note, pavilions that triggered the open ones)
_offer_log: deque[tuple[datetime, int, list[str]]] = deque(maxlen=200)
_offer_seen = [0]


def _note_offers(now: datetime) -> None:
    sent = routing._offer_seq[0]
    if sent > _offer_seen[0]:
        open_offers = list(routing._offers.values())
        triggers = sorted({(o["public"].get("trigger") or {}).get("pavilion_id") or "" for o in open_offers} - {""})
        _offer_log.append((now, sent - _offer_seen[0], triggers))
    _offer_seen[0] = sent


def record(now: datetime, crowd: list[dict] | None = None) -> None:
    """Store the current waits, at most once per SAMPLE_S."""
    _note_offers(now)
    if _history and (now - _history[-1][0]).total_seconds() < SAMPLE_S - 5:
        return
    crowd = crowd if crowd is not None else routing.crowd_snapshot(now)
    _history.append((now, {c["pavilion_id"]: c["wait_min"] for c in crowd}, False))


def backfill(now: datetime) -> None:
    """The server keeps no history across restarts (a redeploy wipes memory). So that the chart
    and the trends work right away, estimate the last BACKFILL_MIN with the planner's own model
    (ML prior + the routed visitors the ledger already holds for those times). Marked estimated."""
    if _history:
        return
    for k in range(BACKFILL_MIN // BACKFILL_STEP_MIN, 0, -1):
        t = now - timedelta(minutes=k * BACKFILL_STEP_MIN)
        _history.append((t, {c["pavilion_id"]: c["wait_min"] for c in routing.crowd_snapshot(t)}, True))


def history(since: datetime | None = None) -> list[Sample]:
    return [h for h in list(_history) if since is None or h[0] >= since]


def _avg(waits: dict[str, int]) -> float:
    return round(sum(waits.values()) / len(waits), 1) if waits else 0.0


def series(now: datetime, minutes: int = 120) -> dict:
    """Site average wait over the last `minutes` (measured once a minute, or estimated after a
    restart), the forecast average for the next 90 minutes, and each pavilion's change vs
    COMPARE_MIN ago (the table's trend arrows). Read-only for the engine."""
    backfill(now)
    crowd = routing.crowd_snapshot(now)
    record(now, crowd)
    current = {c["pavilion_id"]: c["wait_min"] for c in crowd}
    fc = routing.Forecast(now)
    before = _sample_near(now - timedelta(minutes=COMPARE_MIN))
    return {
        "as_of": now.isoformat(),
        "minutes": minutes,
        "points": [{"at": t.isoformat(), "avg_wait_min": _avg(w), "estimated": est}
                   for t, w, est in history(now - timedelta(minutes=minutes))],
        "forecast": [{"minutes": m, "at": (now + timedelta(minutes=m)).isoformat(),
                      "avg_wait_min": round(sum(fc.wait(pid, now + timedelta(minutes=m)) for pid in PAVILIONS)
                                            / len(PAVILIONS), 1)}
                     for m in SERIES_FORECAST_MIN],
        "compare_minutes_ago": round((now - before[0]).total_seconds() / 60) if before else None,
        "compare_estimated": before[2] if before else None,
        "trend": {pid: {"wait_min": w, "wait_before_min": before[1].get(pid) if before else None,
                        "change_min": w - before[1][pid] if before and pid in before[1] else None}
                  for pid, w in current.items()},
    }


def _sample_near(t: datetime) -> Sample | None:
    best = min(list(_history), key=lambda h: abs((h[0] - t).total_seconds()), default=None)
    if best and abs((best[0] - t).total_seconds()) <= COMPARE_TOLERANCE_MIN * 60:
        return best
    return None


def _names(pid: str) -> dict:
    p = PAVILIONS[pid]
    return {"pavilion_id": pid, "name_ar": p.get("name_ar", pid), "name_en": p.get("name_en", pid)}


def facts(now: datetime, stats: dict) -> dict:
    """Everything the briefing may mention. `stats` is engine.admin_stats(now) (plus `connected`)."""
    backfill(now)
    record(now, stats["pavilions"])
    before = _sample_near(now - timedelta(minutes=COMPARE_MIN))
    fc = routing.Forecast(now)
    minutes_ago = round((now - before[0]).total_seconds() / 60) if before else None

    rows = []
    for c in stats["pavilions"]:
        pid, wait = c["pavilion_id"], c["wait_min"]
        p = PAVILIONS[pid]
        ahead = [{"minutes": m, "wait_min": round(fc.wait(pid, now + timedelta(minutes=m)))}
                 for m in FORECAST_STEPS_MIN]
        peak = max(ahead, key=lambda a: a["wait_min"])
        routed = sum(c["routed_next_2h"])
        obs = routing.CROWD.observed.get(pid)
        rows.append({
            **_names(pid),
            "district": p.get("district"),
            "wait_min": wait,
            "status": c["status"],
            "queue_length": c["queue_length"],
            "normal_wait_min": round(prior_wait(pid, now)),
            "wait_before_min": before[1].get(pid) if before else None,
            "forecast": ahead,
            "peak_ahead": peak,
            "routed_next_2h": routed,
            # routed arrivals in the next 2 h as a share of what the pavilion can let in
            "routed_load_pct": round(100 * routed / (p["capacity_per_hour"] * 2)),
            "reported": bool(obs and 0 <= (now - obs[1]).total_seconds() <= PERSIST_MIN * 60),
        })

    def short(r: dict, *keys: str) -> dict:
        return {"pavilion_id": r["pavilion_id"], "name_ar": r["name_ar"], "name_en": r["name_en"],
                **{k: r[k] for k in keys}}

    by_wait = sorted(rows, key=lambda r: -r["wait_min"])
    rising = sorted((r for r in rows if r["wait_before_min"] is not None
                     and r["wait_min"] - r["wait_before_min"] >= RISE_MIN),
                    key=lambda r: r["wait_before_min"] - r["wait_min"])
    falling = sorted((r for r in rows if r["wait_before_min"] is not None
                      and r["wait_before_min"] - r["wait_min"] >= RISE_MIN),
                     key=lambda r: r["wait_min"] - r["wait_before_min"])
    above = sorted((r for r in rows if r["wait_min"] - r["normal_wait_min"] >= ABOVE_NORMAL_MIN),
                   key=lambda r: r["normal_wait_min"] - r["wait_min"])
    peaking = sorted((r for r in rows if r["peak_ahead"]["wait_min"] - r["wait_min"] >= RISE_MIN),
                     key=lambda r: r["wait_min"] - r["peak_ahead"]["wait_min"])
    # Where to send people: the shortest waits, if they are clearly below the site average.
    avg_wait = stats["avg_wait_min"]
    quiet = sorted((r for r in rows if r["status"] != "high" and r["wait_min"] <= 0.7 * avg_wait),
                   key=lambda r: r["wait_min"])
    heavy = sorted(rows, key=lambda r: -r["routed_load_pct"])

    districts = []
    for d in SITE["districts"]:
        ds = [r for r in rows if r["district"] == d["id"]]
        if not ds:
            continue
        hottest = max(ds, key=lambda r: r["wait_min"])
        districts.append({"district": d["id"], "name_ar": d["name_ar"], "name_en": d["name_en"],
                          "avg_wait_min": round(sum(r["wait_min"] for r in ds) / len(ds)),
                          "hottest": short(hottest, "wait_min")})
    districts.sort(key=lambda d: -d["avg_wait_min"])

    avg_now = stats["avg_wait_min"]
    avg_before = (round(sum(before[1].values()) / len(before[1]), 1) if before and before[1] else None)
    avg_60 = round(sum(r["forecast"][1]["wait_min"] for r in rows) / len(rows), 1) if rows else 0
    offers = stats["offers"]

    return {
        "as_of": now.isoformat(),
        "time": now.strftime("%H:%M"),
        "compare_minutes_ago": minutes_ago,       # None if there is no sample from then
        "compare_estimated": before[2] if before else None,   # True: the earlier waits are model estimates
        "site": {
            "avg_wait_min": avg_now,
            "avg_wait_before_min": avg_before,
            "avg_wait_in_60_min": avg_60,
            "high_count": sum(r["status"] == "high" for r in rows),
            "medium_count": sum(r["status"] == "medium" for r in rows),
            "low_count": sum(r["status"] == "low" for r in rows),
            "pavilions": len(rows),
        },
        "visitors": stats["visitors"],
        "offers": {**offers, "acceptance_pct": round(100 * offers["accepted"] / offers["sent"]) if offers["sent"] else None},
        "saved_min_total": stats["saved_min_total"],
        "busiest": [short(r, "wait_min", "status") for r in by_wait[:3]],
        "rising": [short(r, "wait_min", "wait_before_min") for r in rising[:3]],
        "falling": [short(r, "wait_min", "wait_before_min") for r in falling[:3]],
        "above_normal": [short(r, "wait_min", "normal_wait_min") for r in above[:3]],
        "peaking_soon": [short(r, "wait_min", "peak_ahead") for r in peaking[:3]],
        "quiet": [short(r, "wait_min") for r in quiet[:3]],
        "ledger_heavy": [short(r, "routed_next_2h", "routed_load_pct") for r in heavy[:3]],
        "reported_now": [short(r, "wait_min") for r in rows if r["reported"]],
        "districts": districts,
    }


# ---------- alerts feed + pavilion detail ----------
def events(now: datetime, minutes: int = 120, pid: str | None = None) -> list[dict]:
    """Newest first. Built from what the server already keeps: the wait history (went busy,
    calmed down, rising fast; `estimated` when those samples were estimated after a restart),
    crowd reports (POST /debug/observe, staff, sensors), accepted offers and the offer log."""
    since = now - timedelta(minutes=minutes)
    hist = history()
    out: list[dict] = []
    for p in ([pid] if pid else list(PAVILIONS)):
        busy, last_fast = None, None
        window: deque[tuple[datetime, int]] = deque()
        for t, waits, est in hist:
            w = waits.get(p)
            if w is None:
                continue
            if busy is None:
                busy = w >= HIGH_MIN
            elif not busy and w >= HIGH_MIN:
                busy = True
                out.append({"at": t, "kind": "high", "pavilion_id": p, "wait_min": w, "estimated": est})
            elif busy and w < CALM_MIN:
                busy = False
                out.append({"at": t, "kind": "calm", "pavilion_id": p, "wait_min": w, "estimated": est})
            while window and (t - window[0][0]).total_seconds() > FAST_WINDOW_MIN * 60:
                window.popleft()
            low = min((x for _, x in window), default=w)
            if w - low >= FAST_RISE_MIN and (last_fast is None
                                             or (t - last_fast).total_seconds() >= FAST_REPEAT_MIN * 60):
                last_fast = t
                out.append({"at": t, "kind": "rising", "pavilion_id": p, "wait_min": w, "before_min": low,
                            "estimated": est})
            window.append((t, w))
    for p, (w, t) in list(routing.CROWD.observed.items()):
        if pid in (None, p):
            out.append({"at": t, "kind": "report", "pavilion_id": p, "wait_min": round(w), "estimated": False})
    for meta in list(routing._meta.values()):
        for a in meta.get("accepted", []):
            if pid in (None, a.get("trigger")):
                out.append({"at": datetime.fromisoformat(a["at"]), "kind": "accepted",
                            "pavilion_id": a.get("trigger") or "", "saves_min": a["saves_min"], "estimated": False})
    for t, n, triggers in list(_offer_log):
        if pid is None or pid in triggers:
            out.append({"at": t, "kind": "offers", "pavilion_id": triggers[0] if len(triggers) == 1 else "",
                        "count": n, "estimated": False})
    # One alert per happening: a report already says "busy", and "went busy" covers "rising".
    reports = {e["pavilion_id"]: e["at"] for e in out if e["kind"] == "report"}
    highs = {(e["pavilion_id"], e["at"]) for e in out if e["kind"] == "high"}

    def echo(e: dict) -> bool:
        r = reports.get(e["pavilion_id"])
        after_report = r is not None and 0 <= (e["at"] - r).total_seconds() <= 3 * 60
        return (e["kind"] in ("high", "rising") and after_report) or \
            (e["kind"] == "rising" and (e["pavilion_id"], e["at"]) in highs)

    out = [e for e in out if e["at"] >= since and not echo(e)]
    out.sort(key=lambda e: e["at"], reverse=True)
    levels = {"high": "critical", "report": "critical", "rising": "warning", "offers": "info"}
    for e in out:
        e["at"] = e["at"].isoformat()
        e["level"] = levels.get(e["kind"], "good")
    return out[:EVENTS_MAX]


def pavilion(pid: str, now: datetime, minutes: int = 120) -> dict:
    """One pavilion for the detail panel. Read-only."""
    backfill(now)
    stats = routing.admin_stats(now)
    record(now, stats["pavilions"])
    row = next(x for x in stats["pavilions"] if x["pavilion_id"] == pid)
    p = PAVILIONS[pid]
    fc = routing.Forecast(now)
    before = _sample_near(now - timedelta(minutes=COMPARE_MIN))
    obs = routing.CROWD.observed.get(pid)
    routed = sum(row["routed_next_2h"])
    return {
        "as_of": now.isoformat(),
        "pavilion": {k: p.get(k) for k in ("id", "name_ar", "name_en", "district", "type", "capacity_per_hour",
                                             "avg_visit_min", "popularity", "indoor", "tags")},
        "wait_min": row["wait_min"],
        "status": row["status"],
        "queue_length": row["queue_length"],
        "normal_wait_min": round(prior_wait(pid, now)),
        "wait_before_min": before[1].get(pid) if before else None,
        "compare_minutes_ago": round((now - before[0]).total_seconds() / 60) if before else None,
        "compare_estimated": before[2] if before else None,
        "reported": ({"wait_min": round(obs[0]), "at": obs[1].isoformat()}
                     if obs and 0 <= (now - obs[1]).total_seconds() <= PERSIST_MIN * 60 else None),
        "points": [{"at": t.isoformat(), "wait_min": w[pid], "estimated": est}
                   for t, w, est in history(now - timedelta(minutes=minutes)) if pid in w],
        "forecast": [{"minutes": m, "at": (now + timedelta(minutes=m)).isoformat(),
                      "wait_min": round(fc.wait(pid, now + timedelta(minutes=m)))} for m in SERIES_FORECAST_MIN],
        "bucket_min": stats["bucket_min"],
        "buckets": stats["buckets"],
        "routed_next_2h": row["routed_next_2h"],
        "routed_load_pct": round(100 * routed / (p["capacity_per_hour"] * 2)),
        "events": events(now, minutes, pid)[:10],
    }
