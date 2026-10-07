# engine/routing.py — builds and re-plans routes
#
# Inputs: visitor wishlist + constraints, predicted waits (ml/), load ledger, walking times.
# Cost of each choice = walk time + predicted wait (incl. projected load) + shade/comfort penalty.
#
# Start simple: a greedy heuristic that respects pavilion capacity.
# Upgrade later (e.g. OR-Tools) only if time allows.
#
# Also handles:
#   - feasibility check: does the wishlist fit in the visitor's time?
#   - re-planning loop (~every 30s): only reroute if it saves 10+ min,
#     at most once per 15 min per visitor
#   - groups: plan per group, not per person
