"""
Wait-time prediction for day planning, using A's planning model (ml/models/plan_wait.json).

    predict_wait(pavilion, t, daily_visitors=None) -> minutes

The model was trained on European theme-park data, so Expo inputs are converted into
the units and ranges it learned (all assumptions are named constants below):

  feature              model learned                 we feed it
  -------------------  ----------------------------  ------------------------------------------
  ride_popularity      ride's average wait, 5-73 min  pavilion popularity 1-5 -> POP_TO_MIN
  ride_capacity        guests per 15-min slot         capacity_per_hour / 4
  attendance_per_ride  300-2,800 visitors per ride    daily visitors scaled to that range
  is_weekend           Sat/Sun (Europe)               Fri/Sat (Riyadh)
  hour, minute_of_day  European day, peak ~12:30      Riyadh clock mapped by RIYADH_TO_PARK_HOUR

The time mapping replaces a retrain: Riyadh's evening peak (~19:30, heat) is mapped onto the
parks' midday peak. Retraining on simulation or real Expo data would replace it. The live
30-minute model is not used: on A's test it lost to "the wait stays the same", which the
engine uses instead (engine/crowd_state.py).

Returns None when xgboost or the model file is missing, so the engine falls back to its curve.
"""
from __future__ import annotations

import json
from datetime import datetime
from functools import lru_cache
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
MODEL_PATH = ROOT / "ml" / "models" / "plan_wait.json"
META_PATH = ROOT / "ml" / "models" / "models_meta.json"

POP_TO_MIN = {1: 10.0, 2: 18.0, 3: 28.0, 4: 40.0, 5: 55.0}   # inside the learned 5-73 min range
TYPICAL_DAILY_VISITORS = 230_000                            # an ordinary Expo day
TYPICAL_ATTENDANCE_PER_RIDE = 1_500                         # an ordinary park day in the data
APR_RANGE = (300.0, 2_800.0)                                # what the model has seen
RIYADH_WEEKEND = (4, 5)                                     # Friday, Saturday (Monday = 0)
# Riyadh clock (hours) -> park clock (hours): opening, peak, close
RIYADH_TO_PARK_HOUR = ([10.0, 19.5, 24.0], [9.0, 12.5, 22.0])
SLOT_MIN = 15


def attendance_per_ride(daily_visitors: float | None) -> float:
    v = TYPICAL_DAILY_VISITORS if daily_visitors is None else daily_visitors
    return float(np.clip(TYPICAL_ATTENDANCE_PER_RIDE * v / TYPICAL_DAILY_VISITORS, *APR_RANGE))


def park_hour(t: datetime) -> float:
    h = t.hour + t.minute / 60
    if h < RIYADH_TO_PARK_HOUR[0][0] - 1:     # after midnight: treat as late evening
        h += 24
    return float(np.interp(h, *RIYADH_TO_PARK_HOUR))


@lru_cache(maxsize=1)
def _model():
    try:
        import xgboost as xgb
    except ImportError:
        return None
    if not MODEL_PATH.exists():
        return None
    m = xgb.XGBRegressor()
    m.load_model(MODEL_PATH)
    feats = json.loads(META_PATH.read_text())["plan_wait"]["features"] if META_PATH.exists() \
        else m.get_booster().feature_names
    return m, feats


def available() -> bool:
    return _model() is not None


@lru_cache(maxsize=64)
def _day_table(weekend: int, apr: float, pavilions_key: tuple) -> dict:
    """Predict every pavilion for every 15-min slot of a day in one batch (fast lookups after)."""
    model, feats = _model()
    rows, keys = [], []
    for pid, popularity, cap_per_hour in pavilions_key:
        for slot in range(24 * 60 // SLOT_MIN):
            minute = slot * SLOT_MIN
            ph = park_hour(datetime(2000, 1, 1, minute // 60, minute % 60))
            row = {"attendance_per_ride": apr, "is_weekend": weekend, "hour": int(ph),
                   "minute_of_day": int(ph * 60), "ride_popularity": POP_TO_MIN.get(popularity, 28.0),
                   "ride_capacity": cap_per_hour / 4}
            rows.append([row[f] for f in feats])
            keys.append((pid, slot))
    best = getattr(model, "best_iteration", None)
    preds = model.predict(np.asarray(rows, dtype=float),
                          iteration_range=(0, best + 1) if best is not None else None)
    return {k: max(0.0, float(p)) for k, p in zip(keys, preds)}


def predict_wait(pavilion: dict, t: datetime, daily_visitors: float | None = None,
                 pavilions: dict | None = None) -> float | None:
    """Expected wait in minutes at pavilion (a pavilions.json place) at time t, or None."""
    if not available():
        return None
    pavs = pavilions or {pavilion["id"]: pavilion}
    key = tuple(sorted((p["id"], p.get("popularity", 3), float(p.get("capacity_per_hour", 1000)))
                       for p in pavs.values()))
    table = _day_table(int(t.weekday() in RIYADH_WEEKEND), attendance_per_ride(daily_visitors), key)
    return table.get((pavilion["id"], (t.hour * 60 + t.minute) // SLOT_MIN))


if __name__ == "__main__":
    import sys
    sys.path.insert(0, str(ROOT))
    from engine.site import PAVILIONS
    from datetime import timedelta, timezone
    day = datetime(2026, 10, 15, tzinfo=timezone(timedelta(hours=3)))   # a Thursday
    print("model available:", available())
    hours = [10, 13, 16, 19, 21, 23]
    print(f"{'pavilion':16s} pop " + " ".join(f"{h:>5d}h" for h in hours))
    for pid in ["ksa", "jp", "kr", "th_technology", "it", "ng"]:
        p = PAVILIONS[pid]
        vals = [predict_wait(p, day + timedelta(hours=h), pavilions=PAVILIONS) for h in hours]
        print(f"{pid:16s} {p['popularity']:>3d} " + " ".join(f"{v:6.0f}" for v in vals))
