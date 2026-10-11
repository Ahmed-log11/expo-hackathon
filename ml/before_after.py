"""
Before/after chart for the pitch, from tools/balance_check.py results.

Run that first (busy-day setting: our 24 pavilions stand in for the whole Expo, so capacity is scaled):
    python tools/balance_check.py --visitors 6000 --capacity-scale 0.1
then paste its numbers into RESULTS below and run:  python ml/before_after.py
"""
from pathlib import Path

import matplotlib.pyplot as plt

# world: (avg wait min, worst wait min, visitors who gave up)
RESULTS = {
    "No app\n(nearest first)":  (50.3, 321, 3489),
    "30% use\nthe app":         (40.2, 213, 2196),
    "Everyone uses\nthe app":   (32.9, 81, 2),
}
PANELS = [("Average wait", "min", 0), ("Worst wait", "min", 1), ("Visitors who gave up", "", 2)]
COLORS = ["#8a8984", "#86b6ef", "#2a78d6"]   # no app = neutral, partial = light blue, full = blue
INK, INK2, SURFACE = "#0b0b0b", "#52514e", "#fcfcfb"

plt.rcParams.update({"font.size": 11, "axes.spines.top": False, "axes.spines.right": False,
                     "axes.spines.left": False, "axes.edgecolor": "#c9c8c3",
                     "figure.facecolor": SURFACE, "axes.facecolor": SURFACE})
fig, axes = plt.subplots(1, 3, figsize=(12, 4.6))
names = list(RESULTS)
for ax, (title, unit, k) in zip(axes, PANELS):
    vals = [RESULTS[n][k] for n in names]
    bars = ax.bar(range(3), vals, color=COLORS, width=0.62, edgecolor=SURFACE, linewidth=2)
    for b, v in zip(bars, vals):
        label = f"{v:,.0f}{' ' + unit if unit else ''}"
        ax.annotate(label, (b.get_x() + b.get_width() / 2, v), xytext=(0, 4),
                    textcoords="offset points", ha="center", color=INK, fontsize=11)
    drop = 1 - vals[2] / vals[0]
    pct = f"{drop:.1%}" if drop > 0.99 else f"{drop:.0%}"     # 3,489 -> 2 is 99.9%, not 100%
    ax.set_title(f"{title}\n−{pct} with the app", loc="left", color=INK, fontsize=12)
    ax.set_xticks(range(3), names, color=INK2, fontsize=9.5)
    ax.set_yticks([]); ax.set_ylim(0, max(vals) * 1.18)
    ax.tick_params(axis="x", length=0)
fig.suptitle("A busy day at Expo: same visitors, with and without crowd-aware routing",
             x=0.01, ha="left", color=INK, fontsize=13.5)
fig.text(0.01, 0.01, "Simulation: 6,000 visitors, 24 pavilions at 10% capacity (stands in for the full Expo's load).",
         color=INK2, fontsize=9)
plt.tight_layout(rect=(0, 0.04, 1, 0.94))
out = Path(__file__).resolve().parent / "before_after.png"
plt.savefig(out, dpi=150)
print("saved", out)
