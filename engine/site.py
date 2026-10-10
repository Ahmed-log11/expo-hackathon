"""
Site data and the walkway graph.

Loads sim/pavilions.json once. Builds a graph of walkways and precomputes, for every
pair of places, the best path, its walking minutes and how much of it is shaded.

Walkways come from sim/paths.json when that file exists:
    {"edges": [{"from": "jp", "to": "kr", "minutes": 3.5, "shaded": true}, ...]}
Until then they are generated from the layout:
  - the Loop of Nations: places with on_loop=true, connected in a ring by angle (shaded)
  - spokes: every other place connects to its 2 nearest loop places (open sun)
  - the central plaza: central places connect to the Icon and to the loop (shaded)

Path choice prefers shade: an unshaded minute counts as (1 + SUN_PENALTY) minutes when
choosing, but the walk time reported to the visitor is the real one.
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import networkx as nx

ROOT = Path(__file__).resolve().parent.parent
SITE = json.loads((ROOT / "sim" / "pavilions.json").read_text(encoding="utf-8"))
POINTS = {p["id"]: p for p in SITE["places"]}
PAVILIONS = {k: p for k, p in POINTS.items() if p.get("has_queue")}
LANDMARKS = {k: p for k, p in POINTS.items() if not p.get("has_queue")}
HUB = "icon"
DEFAULT_START = "metro"

# Assumptions until sim/paths.json exists (tune with the team):
METERS_PER_UNIT = 20.0      # 0-100 grid ~ 2 km across
WALK_M_PER_MIN = 75.0       # relaxed walking pace in a crowd
SUN_PENALTY = 0.5           # an unshaded minute "costs" 1.5 when choosing a path
LOOP_MIN_RADIUS = 15        # on_loop places closer to the centre than this are plaza, not loop
CENTRE = (50.0, 50.0)


def _xy(pid: str) -> tuple[float, float]:
    return POINTS[pid]["x"], POINTS[pid]["y"]


def _minutes(a: str, b: str) -> float:
    return math.dist(_xy(a), _xy(b)) * METERS_PER_UNIT / WALK_M_PER_MIN


def _generated_edges() -> list[tuple[str, str, bool]]:
    loop = [k for k, p in POINTS.items()
            if p.get("on_loop") and math.dist(_xy(k), CENTRE) > LOOP_MIN_RADIUS]
    loop.sort(key=lambda k: math.atan2(_xy(k)[1] - CENTRE[1], _xy(k)[0] - CENTRE[0]))
    edges = [(a, b, True) for a, b in zip(loop, loop[1:] + loop[:1])]

    for k, p in POINTS.items():
        if k in loop or k == HUB:
            continue
        nearest = sorted(loop, key=lambda j: math.dist(_xy(k), _xy(j)))[:2]
        plaza = p.get("district") == "central" and p.get("on_loop")
        edges += [(k, j, plaza) for j in nearest]   # plaza avenues are shaded; outer spokes are not
        if p.get("district") == "central" and p.get("on_loop"):
            edges.append((k, HUB, True))  # plaza around the Icon
    return edges


def _build_graph() -> tuple[nx.Graph, str]:
    g = nx.Graph()
    g.add_nodes_from(POINTS)
    paths_file = ROOT / "sim" / "paths.json"
    if paths_file.exists():
        for e in json.loads(paths_file.read_text(encoding="utf-8"))["edges"]:
            g.add_edge(e["from"], e["to"], minutes=float(e["minutes"]), shaded=bool(e.get("shaded", False)))
        source = "sim/paths.json"
    else:
        for a, b, shaded in _generated_edges():
            g.add_edge(a, b, minutes=_minutes(a, b), shaded=shaded)
        source = "generated from layout"
    for _, _, d in g.edges(data=True):
        d["cost"] = d["minutes"] * (1 if d["shaded"] else 1 + SUN_PENALTY)
    if not nx.is_connected(g):
        lonely = [n for c in nx.connected_components(g) for n in c if len(c) < len(g)]
        raise ValueError(f"walkway graph is not connected; unreachable: {lonely}")
    return g, source


GRAPH, GRAPH_SOURCE = _build_graph()


def _all_walks() -> dict[tuple[str, str], dict]:
    out = {}
    for a, paths in nx.all_pairs_dijkstra_path(GRAPH, weight="cost"):
        for b, path in paths.items():
            legs = [GRAPH.edges[u, v] for u, v in zip(path, path[1:])]
            total = sum(e["minutes"] for e in legs)
            shaded = sum(e["minutes"] for e in legs if e["shaded"])
            out[a, b] = {
                "minutes": max(1, round(total)) if a != b else 0,
                "path": path,
                "shaded_pct": round(100 * shaded / total) if total else 100,
            }
    return out


WALKS = _all_walks()


def walk(a: str, b: str) -> dict:
    """{"minutes": int, "path": [ids], "shaded_pct": int} for the best walk from a to b."""
    return WALKS[a, b]
