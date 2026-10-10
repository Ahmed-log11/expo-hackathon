"""
B's engine. The API uses only what is exported here:

    import engine
    engine.plan(...), engine.next_stop(...), engine.replan(...), engine.maybe_reroute(...)
"""
from engine.routing import (OfferError, accept_offer, crowd_snapshot, decline_offer,  # noqa: F401
                            expected_wait, expire_offers, find_offer, get_route, headroom,
                            mark_left, maybe_reroute, next_stop, plan, refresh, replan, reset)
from engine.routing import CROWD as _CROWD_AT_IMPORT  # noqa: F401  (use observe() below instead)


def observe(pavilion_id: str, wait_min: float, at) -> None:
    """Feed a measured wait into the crowd state (simulator, scans, staff, demo control)."""
    from engine import routing
    routing.CROWD.observe_wait(pavilion_id, wait_min, at)
from engine.site import (DEFAULT_START, GRAPH_SOURCE, LANDMARKS, PAVILIONS, POINTS,  # noqa: F401
                         SITE, walk)
