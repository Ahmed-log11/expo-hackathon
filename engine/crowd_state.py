# engine/crowd_state.py — live picture of the site
#
# Combines incoming events into numbers per pavilion:
#   - scans in/out      -> people inside, entry rate (ground truth)
#   - location pings    -> people queuing outside / walking toward it (sample, scaled up)
#
# Core estimate:
#   queue length ≈ app users near pavilion, scaled to total visitors
#   wait time    ≈ queue length / entry rate
#
# Fallback: if live data stops, use historical patterns + staff reports.
# Storage: in-memory dictionaries for the hackathon.
