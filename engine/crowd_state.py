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
from ml.predict import RIYADH_WEEKEND, predict_wait

AVG_DAILY_VISITORS = 230_000   # Expo 2030 expected average per day
WEEKEND_RATIO = 1.4            # a weekend day vs a weekday (check against the training data)
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

def expected_visitors(t: datetime) -> float:
    """Visitors expected that day: same weekly average, weekends busier than weekdays."""
    weekday = AVG_DAILY_VISITORS * 7 / (5 + 2 * WEEKEND_RATIO)
    return weekday * WEEKEND_RATIO if t.weekday() in RIYADH_WEEKEND else weekday

# Riyadh correction on top of the model (which learned European parks):
# hour -> multiplier. 1.0 = trust the model as is. Between hours it moves in a straight line.
RIYADH_FACTOR = {10: 1.0, 12: 1.0, 13: 0.9, 14: 0.8, 15: 0.7, 16: 1.0,
                 17: 1.15, 18: 1.2, 20: 1.2, 21: 1.15, 22: 1.0, 24: 1.0}
_FACTOR_PTS = sorted(RIYADH_FACTOR.items())


def riyadh_factor(hour: float) -> float:
    pts = _FACTOR_PTS
    if hour <= pts[0][0]:
        return pts[0][1]
    for (h0, f0), (h1, f1) in zip(pts, pts[1:]):
        if hour <= h1:
            return f0 + (f1 - f0) * (hour - h0) / (h1 - h0)
    return pts[-1][1]


def prior_wait(pid: str, t: datetime) -> float:
    """A's planning model x the Riyadh correction for that hour;
    falls back to the popularity x evening curve if the model isn't available."""
    w = predict_wait(PAVILIONS[pid], t, daily_visitors=expected_visitors(t), pavilions=PAVILIONS)
    if w is not None:
        return w * riyadh_factor(t.hour + t.minute / 60)
    hour = t.hour + t.minute / 60
    curve = 0.35 + 0.65 * math.exp(-((hour - PEAK_HOUR) ** 2) / 10)
    return PAVILIONS[pid].get("popularity", 3) * 11 * curve
