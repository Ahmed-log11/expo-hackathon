"""
Simulated visitors ("bots") for the demo, so the Expo isn't empty.

Without other visitors the ledger is empty, every pavilion follows the same smooth daily
curve, and every visit order costs about the same: a new plan "saves" ~0 minutes. Bots fix
that. Each bot gets a realistic wishlist (popular pavilions wanted far more), an arrival time
(evening-heavy, Riyadh heat) and a stay, and is planned by the real engine, so its visits are
booked in the ledger exactly like an app user's. Each bot stands for a small group, so a few
thousand bots make a busy day without slowing the server.

    seed_day(day, visitors=2000, group=10, rng_seed=7) -> number of bots planned

They are engine-only: no API visitor, no WebSocket, never rerouted. In the pitch say so:
"in the demo, a simulator plays N visitors."
"""
from __future__ import annotations

import random
from datetime import datetime, timedelta

from engine import routing
from engine.site import DEFAULT_START, PAVILIONS

# When bots arrive (hour of day -> weight): a quiet morning, busy late afternoon and evening.
ARRIVAL_WEIGHTS = {10: 3, 11: 4, 12: 4, 13: 3, 14: 3, 15: 5, 16: 8, 17: 10, 18: 10, 19: 8, 20: 5, 21: 2}
STAY_H = (3, 6)
WISHES = (3, 6)
BOT_PREFIX = "bot_"


def seed_day(day: datetime, visitors: int = 2000, group: int = 10, rng_seed: int = 7) -> int:
    """Plan `visitors` bots for the service day containing `day` (arrival order, so each sees
    the ones before it, like real visitors). Returns how many got a plan."""
    if visitors <= 0:
        return 0
    rng = random.Random(f"{rng_seed}-{day.date()}")
    base = day.replace(hour=0, minute=0, second=0, microsecond=0)
    pids = list(PAVILIONS)
    weights = [PAVILIONS[p].get("popularity", 3) ** 2 for p in pids]
    hours, hour_w = list(ARRIVAL_WEIGHTS), list(ARRIVAL_WEIGHTS.values())

    bots = []
    for i in range(visitors):
        start = base + timedelta(hours=rng.choices(hours, hour_w)[0], minutes=rng.randrange(60))
        end = start + timedelta(hours=rng.uniform(*STAY_H))
        wishes: list[str] = []
        while len(wishes) < rng.randint(*WISHES):
            p = rng.choices(pids, weights)[0]
            if p not in wishes:
                wishes.append(p)
        bots.append((start, end, wishes, i))
    bots.sort()

    planned = 0
    for start, end, wishes, i in bots:
        r = routing.plan(f"{BOT_PREFIX}{base:%Y%m%d}_{i}", wishes, start, end, DEFAULT_START, group_size=group)
        planned += bool(r["stops"])
    return planned


def is_bot(visitor_id: str) -> bool:
    return visitor_id.startswith(BOT_PREFIX)
