"""
Crowd state: the background wait at each pavilion, i.e. the wait caused by everyone
the engine has NOT routed. The ledger adds the routed visitors on top.

    base_wait(pid, t) -> minutes

Sources, best first:
  1. An observation (sim scans, staff report): held as-is for PERSIST_MIN, then faded
     into the prior over FADE_MIN. A's tests showed "the wait stays the same" beats the
     ML model 30 minutes ahead; a busy pavilion stays busy for a while.
  2. The prior: a time-of-day curve from popularity, peaking in the evening (Riyadh heat).
     Swap for A's planning model (ml/predict.py) once its units are fixed.
  3. 0, when the prior is switched off (experiments where every visitor is routed).
"""
from __future__ import annotations

import math
from datetime import datetime

from engine.site import PAVILIONS

PERSIST_MIN = 30
FADE_MIN = 60
PEAK_HOUR = 19.5


class CrowdState:
    def __init__(self, use_prior: bool = True) -> None:
        self.use_prior = use_prior
        self.observed: dict[str, tuple[float, datetime]] = {}

    # ---- inputs (from sim/ in the demo, real scans later) ----
    def observe_wait(self, pid: str, wait_min: float, at: datetime) -> None:
        self.observed[pid] = (max(0.0, wait_min), at)

    def observe_queue(self, pid: str, people: int, at: datetime) -> None:
        """Queue length -> wait, using the pavilion's entry rate."""
        self.observe_wait(pid, people / rate_per_min(pid), at)

    # ---- output ----
    def base_wait(self, pid: str, t: datetime) -> float:
        """Observed wait held for PERSIST_MIN, then faded linearly into the prior over FADE_MIN."""
        normal = prior_wait(pid, t) if self.use_prior else 0.0
        obs = self.observed.get(pid)
        if not obs:
            return normal
        age = (t - obs[1]).total_seconds() / 60
        if age < -PERSIST_MIN:                       # far in the past relative to the observation
            return normal
        if age <= PERSIST_MIN:
            return obs[0]
        if age >= PERSIST_MIN + FADE_MIN:
            return normal
        k = (age - PERSIST_MIN) / FADE_MIN
        return obs[0] * (1 - k) + normal * k


def rate_per_min(pid: str) -> float:
    return PAVILIONS[pid]["capacity_per_hour"] / 60


def prior_wait(pid: str, t: datetime) -> float:
    """Popularity x evening-peaked curve. Popularity 5: ~55 min at peak, ~20 in the morning."""
    hour = t.hour + t.minute / 60
    curve = 0.35 + 0.65 * math.exp(-((hour - PEAK_HOUR) ** 2) / 10)
    return PAVILIONS[pid].get("popularity", 3) * 11 * curve
