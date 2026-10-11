"""
Compare the engine's "normal crowd" before and after the ML model.

  old: hand-made formula (popularity x evening curve) - same numbers every day
  new: A's planning model (that day's crowd) x a Riyadh correction per hour (midday heat, evening rush)

Run from the repo root:  python ml/compare_prior.py
Saves ml/compare_prior.png and prints a table.
"""
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import matplotlib.pyplot as plt  # noqa: E402

from engine import crowd_state as cs  # noqa: E402
from ml.predict import predict_wait  # noqa: E402

PID = "jp"
THU, FRI = datetime(2026, 10, 15), datetime(2026, 10, 16)
HOURS = [h + m / 60 for h in range(10, 24) for m in (0, 30)]


def at(day, h):
    return day.replace(hour=int(h), minute=int(round((h % 1) * 60)))


def formula(t):
    """The engine's original guess: popularity x a bell curve peaking at 7:30 PM."""
    hour = t.hour + t.minute / 60
    curve = 0.35 + 0.65 * cs.math.exp(-((hour - 19.5) ** 2) / 10)
    return cs.PAVILIONS[PID].get("popularity", 3) * 11 * curve


old = [formula(at(THU, h)) for h in HOURS]
weekday = [cs.prior_wait(PID, at(THU, h)) for h in HOURS]
weekend = [cs.prior_wait(PID, at(FRI, h)) for h in HOURS]

# table: 7 PM across crowd sizes
p = cs.PAVILIONS[PID]
print(f"{PID} at 7 PM")
print(f"  old formula, any day          : {formula(at(THU, 19)):5.1f} min")
for v in (100_000, 150_000, 206_000, 289_000, 400_000):
    print(f"  model, {v:>7,} visitors       : {predict_wait(p, at(THU, 19), v, cs.PAVILIONS):5.1f} min")

BLUE, ORANGE, GRAY, INK, INK2 = "#2a78d6", "#eb6834", "#8a8984", "#0b0b0b", "#52514e"
plt.rcParams.update({"font.size": 11, "axes.spines.top": False, "axes.spines.right": False,
                     "axes.edgecolor": "#c9c8c3", "axes.grid": True, "grid.color": "#ecebe7",
                     "axes.axisbelow": True, "figure.facecolor": "#fcfcfb", "axes.facecolor": "#fcfcfb"})
fig, ax = plt.subplots(figsize=(10, 5.2))
ax.plot(HOURS, old, color=GRAY, lw=2, ls="--", label="Old formula (same every day)")
ax.plot(HOURS, weekday, color=BLUE, lw=2, label="New: ML model x Riyadh correction, weekday")
ax.plot(HOURS, weekend, color=ORANGE, lw=2, label="New: ML model x Riyadh correction, Fri/Sat")
i = HOURS.index(19)
ax.scatter([19, 19], [weekday[i], weekend[i]], s=40, color=[BLUE, ORANGE], zorder=3, edgecolors="white")
ax.annotate(f"Peak 5-9 PM: {weekday[i]:.0f} vs {weekend[i]:.0f} min", (19, weekend[i]), xytext=(0, 12),
            textcoords="offset points", ha="center", color=INK, fontsize=10)
ax.set_xticks(range(10, 25, 2), [f"{h % 12 or 12}{'am' if h < 12 or h == 24 else 'pm'}" for h in range(10, 25, 2)])
ax.set_xlim(10, 24); ax.set_ylim(0, max(weekend) * 1.2)
ax.set_ylabel("Expected wait (minutes)", color=INK2)
ax.set_title("Japan pavilion: expected wait through the day", loc="left", color=INK, fontsize=13)
ax.legend(frameon=False, loc="upper left", fontsize=10)
plt.tight_layout()
out = Path(__file__).resolve().parent / "compare_prior.png"
plt.savefig(out, dpi=150)
print("saved", out)