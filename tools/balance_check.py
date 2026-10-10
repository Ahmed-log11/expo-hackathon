"""
Does the ledger actually help? A minute-by-minute queue simulation.

This is B's self-check, not A's full simulator. Same visitors, same wishlists, three worlds:
  1. Nearest-first: nobody uses the app; after each visit, walk to the nearest remaining wish.
  2. Balanced 100%: everyone follows the engine's route (ledger on).
  3. Balanced 30%: 30% follow the engine, 70% walk nearest-first.
Optional 4th (--no-ledger): everyone uses the engine with the ledger switched off,
i.e. a smart app that tells each person where it's quiet but doesn't coordinate.

Queues are real FIFO lines: each pavilion lets in capacity_per_hour/60 people per minute.
App users plan on arrival and re-plan after every visit, seeing the current queues
(observed every 5 min) + the ledger. Simplification: visitors walk straight to the next
stop and follow the plan. Everyone must finish by their leave time: a visitor still in
line when a visit can no longer fit gives up (counted, and the visit doesn't count).

    python tools/balance_check.py                 # 12,000 visitors
    python tools/balance_check.py --visitors 10000 --capacity-scale 0.25 --only offers
"""
from __future__ import annotations

import argparse
import random
import sys
import time
from collections import deque
from datetime import datetime, timedelta, timezone
from pathlib import Path
from statistics import mean

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import engine  # noqa: E402
from engine import routing  # noqa: E402

RIYADH = timezone(timedelta(hours=3))
DAY = datetime(2026, 10, 15, tzinfo=RIYADH)
OPEN_MIN, LAST_ENTRY_MIN, CLOSE_MIN = 10 * 60, 15 * 60, 23 * 60
STAY_H = (5, 7)
OBSERVE_EVERY = 5


def make_visitors(n: int, seed: int) -> list[dict]:
    rng = random.Random(seed)
    pids = list(engine.PAVILIONS)
    weights = [engine.PAVILIONS[p]["popularity"] ** 2 for p in pids]   # popular pavilions wanted far more
    visitors = []
    for i in range(n):
        k = rng.randint(4, 6)
        wishes = []
        while len(wishes) < k:
            p = rng.choices(pids, weights)[0]
            if p not in wishes:
                wishes.append(p)
        start = rng.randint(OPEN_MIN, LAST_ENTRY_MIN)
        visitors.append({"id": f"v{i}", "wishes": wishes, "start": start,
                         "end": min(CLOSE_MIN, start + rng.randint(*STAY_H) * 60)})
    return visitors


def at(minute: int) -> datetime:
    return DAY + timedelta(minutes=minute)


def run(visitors: list[dict], adoption: float, use_ledger: bool, seed: int, mode: str = "replan") -> dict:
    """mode "replan": the app silently re-plans after every visit.
       mode "offers": the app refreshes times silently and only PROPOSES order changes
                      (capped per pavilion); 80% accept."""
    routing.reset(use_prior=False, day0=DAY)
    rng = random.Random(seed + 1)
    rate = {p: engine.PAVILIONS[p]["capacity_per_hour"] / 60 for p in engine.PAVILIONS}
    queue = {p: deque() for p in engine.PAVILIONS}
    tokens = {p: 0.0 for p in engine.PAVILIONS}
    events: dict[int, list] = {}          # minute -> [(kind, visitor, pavilion)]
    waits, gave_up, peak_wait, log = [], [], {p: 0.0 for p in engine.PAVILIONS}, []
    state = {}

    def schedule(m, item):
        events.setdefault(m, []).append(item)

    def go_next(v, here, m):
        s = state[v["id"]]
        if s["app"]:
            nxt = s["plan"].pop(0) if s["plan"] else None
        else:
            left = [p for p in v["wishes"] if p not in s["done"]]
            nxt = min(left, key=lambda p: engine.walk(here, p)["minutes"]) if left else None
        if nxt is None:
            return
        arrive = m + engine.walk(here, nxt)["minutes"]
        if arrive >= v["end"]:
            return
        schedule(arrive, ("arrive", v, nxt))

    by_start: dict[int, list] = {}
    for v in visitors:
        by_start.setdefault(v["start"], []).append(v)

    for m in range(OPEN_MIN, CLOSE_MIN + 1):
        if m % OBSERVE_EVERY == 0:                      # crowd state sees the real queues
            for p in engine.PAVILIONS:
                routing.CROWD.observe_queue(p, len(queue[p]), at(m))
        for v in by_start.get(m, []):
            app = rng.random() < adoption
            state[v["id"]] = {"app": app, "done": [], "plan": []}
            if app:
                r = engine.plan(v["id"], v["wishes"], at(m), at(v["end"]), "metro", use_ledger=use_ledger)
                state[v["id"]]["plan"] = [s["pavilion_id"] for s in r["stops"]]
            go_next(v, "metro", m)
        for kind, v, p in events.pop(m, []):
            if kind == "arrive":
                queue[p].append((v, m))
            else:                                       # "leave"
                state[v["id"]]["done"].append(p)
                if state[v["id"]]["app"]:
                    engine.mark_left(v["id"], p)
                    if mode == "replan":                # re-plan after every visit
                        r = engine.replan(v["id"], None, at(m))
                        state[v["id"]]["plan"] = [s["pavilion_id"] for s in r["stops"]]
                    else:                               # refresh times silently; order changes are offers
                        r = engine.refresh(v["id"], at(m))
                        state[v["id"]]["plan"] = [s["pavilion_id"] for s in r["stops"]]
                        offer = engine.find_offer(v["id"], at(m))
                        if offer:
                            if rng.random() < 0.8:
                                r = engine.accept_offer(v["id"], offer["offer_id"], at(m))
                                state[v["id"]]["plan"] = [s["pavilion_id"] for s in r["stops"]]
                            else:
                                engine.decline_offer(v["id"], offer["offer_id"], at(m))
                go_next(v, p, m)
        for p in engine.PAVILIONS:                      # let people in
            tokens[p] += rate[p]
            q = queue[p]
            while q and tokens[p] >= 1:
                v, joined = q.popleft()
                if m + engine.PAVILIONS[p]["avg_visit_min"] > v["end"]:
                    gave_up.append(m - joined)          # time's up: leaves the line, visit not counted
                    continue
                tokens[p] -= 1
                w = m - joined
                waits.append(w)
                log.append((v["id"], p, w, m))
                peak_wait[p] = max(peak_wait[p], w)
                schedule(m + engine.PAVILIONS[p]["avg_visit_min"], ("leave", v, p))
            if not q:
                tokens[p] = min(tokens[p], rate[p])     # unused capacity doesn't pile up

    done = [len(s["done"]) / len(v["wishes"]) for v, s in ((v, state[v["id"]]) for v in visitors)]
    waits.sort()
    return {"avg wait": mean(waits), "p95 wait": waits[int(0.95 * len(waits))],
            "worst pavilion": max(peak_wait.values()),
            "wishes done": 100 * mean(done), "visits": len(waits), "gave up": len(gave_up), "log": log}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--visitors", type=int, default=12000)
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--capacity-scale", type=float, default=1.0,
                    help="shrink capacities to model a busy day with fewer simulated visitors (faster)")
    ap.add_argument("--only", help="run one world whose name contains this text")
    ap.add_argument("--headroom", type=float, help="offers: extra wait allowed per window (min)")
    ap.add_argument("--cooldown", type=float, help="offers: minutes before the same visitor is asked again")
    ap.add_argument("--min-saving", type=float, help="minimum minutes saved to propose a change")
    a = ap.parse_args()
    for p in engine.PAVILIONS.values():
        p["capacity_per_hour"] *= a.capacity_scale
    if a.headroom is not None:
        routing.HEADROOM_EXTRA_WAIT_MIN = a.headroom
    if a.cooldown is not None:
        routing.OFFER_COOLDOWN_MIN = a.cooldown
    if a.min_saving is not None:
        routing.REROUTE_MIN_SAVING = a.min_saving

    visitors = make_visitors(a.visitors, a.seed)
    worlds = [("Nearest-first (no app)", 0.0, True, "replan"),
              ("Smart app, no ledger", 1.0, False, "replan"),
              ("Ledger, re-plan always", 1.0, True, "replan"),
              ("Ledger + capped offers", 1.0, True, "offers"),
              ("Capped offers, 30% use app", 0.3, True, "offers")]
    print(f"{a.visitors:,} visitors, {len(engine.PAVILIONS)} pavilions, capacity x{a.capacity_scale}, seed {a.seed}\n")
    print(f"{'world':28s} {'avg wait':>9s} {'p95 wait':>9s} {'worst':>7s} {'wishes done':>12s} {'gave up':>8s}")
    for name, adoption, ledger, mode in worlds:
        if a.only and a.only.lower() not in name.lower():
            continue
        t0 = time.time()
        r = run(visitors, adoption, ledger, a.seed, mode)
        print(f"{name:28s} {r['avg wait']:8.1f}m {r['p95 wait']:8.0f}m {r['worst pavilion']:6.0f}m "
              f"{r['wishes done']:11.0f}% {r['gave up']:8,}   ({time.time() - t0:.0f}s)")


if __name__ == "__main__":
    main()
