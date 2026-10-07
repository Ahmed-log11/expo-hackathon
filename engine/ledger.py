# engine/ledger.py — the load ledger (this is what makes it "collective")
#
# Tracks where already-assigned visitors are EXPECTED to be, and when.
#   - assign a visitor to a pavilion  -> add their expected arrival to its future load
#   - visitor scans in                -> convert expected to actual
#   - visitor rerouted                -> remove old reservation, add new one
#
# The routing engine reads this so the next visitor sees projected crowds,
# not just current ones. That stops everyone being sent to the same "quiet" spot.
