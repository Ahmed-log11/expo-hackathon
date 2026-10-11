"""
The load ledger: where routed visitors are EXPECTED to be, and when.
This is what makes the routing collective instead of everyone chasing the same quiet spot.

For each pavilion it keeps the expected arrivals per 5-minute slot. A forecast starts from
the queue as it is NOW and adds only FUTURE bookings, running a simple queue model:

    backlog[now]  = people in the queue now (observed, or 0)
    backlog[s]    = max(0, backlog[s-1] + booked_arrivals[s] - served_per_slot)
    wait at slot s = (backlog[s-1] + half of slot s's own arrivals) / entries per minute

Past bookings are never replayed: what really happened is already in the observed queue,
and old bookings at times people didn't actually arrive would create phantom queues.

    book(visitor_id, pid, t, people=1)    reserve one expected arrival (people = group size)
    release(visitor_id, after=None)       drop a visitor's reservations (all, or from a time on)
    forecast(pid, now, queue_now) -> Outlook (.wait_at(slot) = minutes)
"""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta

from engine.crowd_state import rate_per_min
from engine.site import PAVILIONS

SLOT_MIN = 5
TRUST_H = 2.0          # bookings further ahead than this are ignored: plans change, far ones mislead
HORIZON_H = 36                       # a day plus a margin past midnight
N_SLOTS = HORIZON_H * 60 // SLOT_MIN


class Ledger:
    def __init__(self, day0: datetime) -> None:
        self.day0 = day0.replace(hour=0, minute=0, second=0, microsecond=0)
        self.arrivals = {pid: [0.0] * N_SLOTS for pid in PAVILIONS}
        self.bookings: dict[str, list[tuple[str, int, float]]] = defaultdict(list)

    def slot(self, t: datetime) -> int:
        s = int((t - self.day0).total_seconds() // (SLOT_MIN * 60))
        return min(max(s, 0), N_SLOTS - 1)

    def slot_start(self, s: int) -> datetime:
        return self.day0 + timedelta(minutes=s * SLOT_MIN)

    # ---- writes ----
    def _add(self, pid: str, s: int, people: float) -> None:
        self.arrivals[pid][s] += people

    def book(self, visitor_id: str, pid: str, t: datetime, people: float = 1) -> None:
        s = self.slot(t)
        self._add(pid, s, people)
        self.bookings[visitor_id].append((pid, s, people))

    def release(self, visitor_id: str, after: datetime | None = None) -> None:
        cut = self.slot(after) if after else -1
        keep = []
        for pid, s, people in self.bookings.pop(visitor_id, []):
            if s >= cut:
                self._add(pid, s, -people)
            else:
                keep.append((pid, s, people))
        if keep:
            self.bookings[visitor_id] = keep

    # ---- reads ----
    def forecast(self, pid: str, now: datetime, queue_now: float = 0.0) -> "Outlook":
        """Waits for arriving at pid in each slot from now on (see Outlook.wait_at).
        Only the next TRUST_H hours of bookings are simulated; after that the queue just
        drains at the pavilion's rate, which is computed directly instead of slot by slot."""
        rate = rate_per_min(pid)
        served = rate * SLOT_MIN
        s0, arr = self.slot(now), self.arrivals[pid]
        last_trusted = min(N_SLOTS - 1, s0 + int(TRUST_H * 60 / SLOT_MIN))
        waits, backlog = [], max(0.0, queue_now)
        for s in range(s0, last_trusted + 1):
            future = arr[s] if s > s0 else 0.0    # this slot's bookings are mostly in line already
            waits.append((backlog + future / 2) / rate)
            backlog = max(0.0, backlog + future - served)
        return Outlook(s0, waits, backlog, served, rate)


class Outlook:
    """Result of Ledger.forecast: per-slot waits for the trusted window, then a draining queue."""
    __slots__ = ("s0", "waits", "backlog_after", "served", "rate")

    def __init__(self, s0: int, waits: list[float], backlog_after: float, served: float, rate: float):
        self.s0, self.waits, self.backlog_after, self.served, self.rate = s0, waits, backlog_after, served, rate

    def wait_at(self, slot: int) -> float:
        i = max(slot - self.s0, 0)
        if i < len(self.waits):
            return self.waits[i]
        drained = self.served * (i - len(self.waits))
        return max(0.0, self.backlog_after - drained) / self.rate

    def expected_arrivals(self, pid: str, t: datetime) -> float:
        return self.arrivals[pid][self.slot(t)]
