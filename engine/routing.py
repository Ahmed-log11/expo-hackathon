"""
Routing: builds and re-plans each visitor's route.

Cost of a route = when the visitor finishes (walk + expected wait + visit, stop by stop).
Expected wait = the queue now (observed, or the prior curve when there's no observation)
              + the queue our routed visitors will add (ledger.forecast, next 2 hours)

Steps for one visitor:
  1. Skip wishes whose queue is over MAX_WAIT_MIN all day (reported as "too_busy").
  2. Search visit orders for the earliest finish, never placing a stop into a queue
     over MAX_WAIT_MIN (exact search up to EXACT_MAX stops, greedy + swaps above that).
  3. If nothing fits before end_time, drop the LEAST wanted wish and search again.
  4. Book the chosen arrivals in the ledger, so the next visitor plans around them.

Public interface (what api/main.py calls):
    plan, get_route, next_stop, mark_left, replan, maybe_reroute, crowd_snapshot, reset
"""
from __future__ import annotations

from datetime import datetime, timedelta

from engine.crowd_state import CrowdState, rate_per_min
from engine.ledger import Ledger
from engine.site import DEFAULT_START, PAVILIONS, walk

EXACT_MAX = 7              # exact search up to this many stops (7! = 5040 orders, pruned)
MAX_WAIT_MIN = 60          # never plan a stop into a longer queue; come back later or skip it
REROUTE_MIN_SAVING = 10    # only reroute if it saves at least this many minutes
REROUTE_COOLDOWN_MIN = 15  # and at most once per this many minutes per visitor

CROWD = CrowdState(use_prior=True)
LEDGER: Ledger | None = None
_routes: dict[str, dict] = {}
_meta: dict[str, dict] = {}   # visitor_id -> {"group": n, "last_reroute": datetime|None}


def reset(use_prior: bool = True, day0: datetime | None = None) -> None:
    """Fresh engine state (used by experiments and tests)."""
    global CROWD, LEDGER
    CROWD = CrowdState(use_prior=use_prior)
    LEDGER = Ledger(day0) if day0 else None
    _routes.clear()
    _meta.clear()
    _offers.clear()
    _cap.clear()


def _ledger_for(t: datetime) -> Ledger:
    global LEDGER
    if LEDGER is None:
        LEDGER = Ledger(t)
    return LEDGER


def _iso(t: datetime) -> str:
    return t.replace(second=0, microsecond=0).isoformat()


class Forecast:
    """Expected waits as seen at `now`, for one planning call.

        wait(pid, t) = background(pid, t)   crowd_state: observed wait held, then faded to normal
                     + routed(pid, t)       ledger: queue our FUTURE bookings will add (with ledger)

    Visitors already standing in line are inside the observation; the ledger only adds
    bookings after now, so nobody is counted twice."""

    def __init__(self, now: datetime, use_ledger: bool = True) -> None:
        self.now, self.use_ledger = now, use_ledger
        self.led = _ledger_for(now)
        self._cache: dict[str, tuple[int, list[float]]] = {}

    def wait(self, pid: str, t: datetime) -> float:
        background = CROWD.base_wait(pid, t)
        if not self.use_ledger:
            return background
        if pid not in self._cache:
            self._cache[pid] = self.led.forecast(pid, self.now, 0.0)
        s0, routed = self._cache[pid]
        i = min(max(self.led.slot(t) - s0, 0), len(routed) - 1)
        return background + routed[i]


def expected_wait(pid: str, t: datetime, now: datetime | None = None, use_ledger: bool = True) -> float:
    return Forecast(now or t, use_ledger).wait(pid, t)


# ---------- search ----------
def _best_order(wishes: list[str], here: str, t0: datetime, end: datetime, use_ledger: bool,
                max_wait: float = MAX_WAIT_MIN):
    """Earliest-finishing feasible order of ALL wishes, or None."""
    fc = Forecast(t0, use_ledger)
    wait_at = fc.wait

    def step(cur: str, t: datetime, pid: str) -> tuple[datetime, int, int]:
        w = walk(cur, pid)["minutes"]
        arrive = t + timedelta(minutes=w)
        wt = round(wait_at(pid, arrive))
        leave = arrive + timedelta(minutes=wt + PAVILIONS[pid]["avg_visit_min"])
        return leave, w, wt

    if len(wishes) <= EXACT_MAX:
        best: list = [None, None]  # finish time, order

        def dfs(cur: str, t: datetime, left: list[str], order: list[str]) -> None:
            if not left:
                if best[0] is None or t < best[0]:
                    best[0], best[1] = t, order[:]
                return
            for pid in left:
                leave, _, wt = step(cur, t, pid)
                if leave > end or wt > max_wait or (best[0] is not None and leave >= best[0]):
                    continue  # infeasible, queue too long right then, or already worse than the best
                order.append(pid)
                dfs(pid, leave, [p for p in left if p != pid], order)
                order.pop()

        dfs(here, t0, wishes, [])
        return best[1]

    # many stops: greedy by finish time, then improve with adjacent swaps
    def finish(order: list[str]) -> datetime | None:
        cur, t = here, t0
        for pid in order:
            t, _, wt = step(cur, t, pid)
            if t > end or wt > max_wait:
                return None
            cur = pid
        return t

    order, cur, t, left = [], here, t0, list(wishes)
    while left:
        pid = min(left, key=lambda p: step(cur, t, p)[0])
        t, _, _ = step(cur, t, pid)
        order.append(pid)
        left.remove(pid)
        cur = pid
    best_f = finish(order)
    improved = True
    while improved and best_f:
        improved = False
        for i in range(len(order) - 1):
            cand = order[:i] + [order[i + 1], order[i]] + order[i + 2:]
            f = finish(cand)
            if f and f < best_f:
                order, best_f, improved = cand, f, True
    return order if best_f else None


def _too_busy(wishes: list[str], t0: datetime, end: datetime, use_ledger: bool) -> list[str]:
    """Wishes whose expected wait is over MAX_WAIT_MIN at every moment until the visitor leaves."""
    fc, out = Forecast(t0, use_ledger), []
    for pid in wishes:
        t, last = t0, end - timedelta(minutes=PAVILIONS[pid]["avg_visit_min"])
        ok = False
        while t <= last and not ok:
            ok = fc.wait(pid, t) <= MAX_WAIT_MIN
            t += timedelta(minutes=10)
        if not ok:
            out.append(pid)
    return out


def _materialize(visitor_id: str, order: list[str], here: str, t: datetime,
                 end: datetime, use_ledger: bool) -> list[dict]:
    stops, fc = [], Forecast(t, use_ledger)
    for pid in order:
        w = walk(here, pid)
        arrive = t + timedelta(minutes=w["minutes"])
        wait = round(fc.wait(pid, arrive))
        visit = PAVILIONS[pid]["avg_visit_min"]
        leave = arrive + timedelta(minutes=wait + visit)
        stops.append({
            "order": len(stops) + 1, "pavilion_id": pid,
            "walk_from_prev_min": w["minutes"], "arrive_at": _iso(arrive),
            "wait_min": wait, "visit_min": visit, "leave_at": _iso(leave),
            "path": w["path"], "landmarks": w["path"][1:-1], "shaded_pct": w["shaded_pct"],
        })
        here, t = pid, leave
    return stops


def _route(visitor_id: str, wishes: list[str], here: str, t0: datetime, end: datetime,
           requested: list[str], use_ledger: bool = True, book: bool = True) -> dict:
    keep = [w for w in dict.fromkeys(wishes) if w in PAVILIONS]
    too_busy = _too_busy(keep, t0, end, use_ledger)
    keep = [w for w in keep if w not in too_busy]
    order = None
    while keep:
        order = _best_order(keep, here, t0, end, use_ledger)
        if order is not None:
            break
        keep = keep[:-1]          # drop the least wanted wish and try again
    stops = _materialize(visitor_id, order or [], here, t0, end, use_ledger)

    if book:
        people = _meta.get(visitor_id, {}).get("group", 1)
        for s in stops:
            _ledger_for(t0).book(visitor_id, s["pavilion_id"], datetime.fromisoformat(s["arrive_at"]), people)

    planned = {s["pavilion_id"] for s in stops}
    route = {
        "visitor_id": visitor_id,
        "version": _routes.get(visitor_id, {}).get("version", 0) + 1,
        "generated_at": _iso(t0),
        "start_point": here,
        "end_time": _iso(end),
        "stops": stops,
        "totals": {"walk_min": sum(s["walk_from_prev_min"] for s in stops),
                   "wait_min": sum(s["wait_min"] for s in stops), "stops": len(stops)},
        "feasibility": {"fits": len(stops), "requested": len(requested),
                        "dropped": [w for w in requested if w not in planned],
                        "too_busy": too_busy},
        "summary": None,
    }
    return route


# ---------- public interface ----------
def plan(visitor_id: str, wishlist: list[str], start_time: datetime, end_time: datetime,
         start_point: str = DEFAULT_START, group_size: int = 1, use_ledger: bool = True) -> dict:
    """wishlist is in priority order. Books the result in the ledger."""
    _meta[visitor_id] = {"group": max(1, group_size), "last_reroute": None, "use_ledger": use_ledger,
                         "wishlist": list(dict.fromkeys(wishlist)), "done": [], "at": start_point}
    _ledger_for(start_time).release(visitor_id)
    route = _route(visitor_id, wishlist, start_point, start_time, end_time,
                   _meta[visitor_id]["wishlist"], use_ledger, book=use_ledger)
    _routes[visitor_id] = route
    return route


def get_route(visitor_id: str) -> dict | None:
    return _routes.get(visitor_id)


def next_stop(visitor_id: str) -> dict | None:
    route = _routes.get(visitor_id)
    if not route or not route["stops"]:
        return None
    s = route["stops"][0]
    return {"visitor_id": visitor_id, "route_version": route["version"],
            "pavilion_id": s["pavilion_id"], "walk_min": s["walk_from_prev_min"],
            "wait_min": s["wait_min"], "arrive_at": s["arrive_at"], "path": s["path"],
            "landmarks": s["landmarks"], "shaded_pct": s["shaded_pct"],
            "remaining_stops": len(route["stops"]) - 1}


def mark_left(visitor_id: str, pavilion_id: str) -> None:
    """Visitor finished a stop. Its reservation stays: that arrival really happened."""
    route = _routes.get(visitor_id)
    if not route:
        return
    route["stops"] = [s for s in route["stops"] if s["pavilion_id"] != pavilion_id]
    for i, s in enumerate(route["stops"], 1):
        s["order"] = i
    meta = _meta.setdefault(visitor_id, {})
    meta.setdefault("done", []).append(pavilion_id)
    meta["at"] = pavilion_id                  # where the visitor is now


def _position(visitor_id: str, route: dict) -> str:
    return _meta.get(visitor_id, {}).get("at") or route["start_point"]


def _open_wishes(visitor_id: str, route: dict) -> list[str]:
    """Wishes not yet visited, in the visitor's priority order (dropped ones included:
    if the day went better than expected, they can come back)."""
    meta = _meta.get(visitor_id, {})
    done = set(meta.get("done", []))
    wishlist = meta.get("wishlist") or [s["pavilion_id"] for s in route["stops"]]
    return [w for w in wishlist if w not in done]


def replan(visitor_id: str, constraints: dict | None = None, now: datetime | None = None) -> dict:
    """Re-plan the remaining stops from the visitor's position.
    constraints: {"remove": [ids], "add": [ids], "end_time": datetime}"""
    route = _routes[visitor_id]
    now = now or datetime.fromisoformat(route["generated_at"])
    c = constraints or {}
    meta = _meta.setdefault(visitor_id, {})
    removed = set(c.get("remove", []))
    if removed:   # a removal is a decision ("skip Germany"), so it sticks for later replans
        meta["wishlist"] = [w for w in meta.get("wishlist", []) if w not in removed]
    if c.get("add"):
        meta["wishlist"] = list(dict.fromkeys(meta.get("wishlist", []) + list(c["add"])))
    wishes = [w for w in _open_wishes(visitor_id, route) if w not in removed]
    end = c.get("end_time") or datetime.fromisoformat(route["end_time"])
    _ledger_for(now).release(visitor_id, after=now)
    use_ledger = meta.get("use_ledger", True)          # a visitor keeps one mode all day
    new = _route(visitor_id, wishes, _position(visitor_id, route), now, end, wishes,
                 use_ledger, book=use_ledger)
    _routes[visitor_id] = new
    return new


def _alternative(visitor_id: str, now: datetime):
    """Compare the visitor's current plan with the best new one, judged without the
    visitor's own future load. Leaves the ledger exactly as it found it.
    Returns (current_stops, candidate_route, minutes_saved) or None if not worth changing."""
    route = _routes.get(visitor_id)
    if not route or not route["stops"]:
        return None
    led = _ledger_for(now)
    here, end = _position(visitor_id, route), datetime.fromisoformat(route["end_time"])
    wishes = [st["pavilion_id"] for st in route["stops"]]
    open_wishes = _open_wishes(visitor_id, route)

    old_bookings = list(led.bookings.get(visitor_id, []))
    led.release(visitor_id, after=now)
    try:
        current = _materialize(visitor_id, wishes, here, now, end, True)
        candidate = _route(visitor_id, open_wishes, here, now, end, open_wishes, book=False)
    finally:
        cut = led.slot(now)
        for pid, sl, people in old_bookings:          # put the visitor's own load back
            if sl >= cut:
                led._add(pid, sl, people)
        led.bookings[visitor_id] = old_bookings

    def finish(stops):
        return datetime.fromisoformat(stops[-1]["leave_at"]) if stops else now
    saving = int((finish(current) - finish(candidate["stops"])).total_seconds() // 60)
    same = [st["pavilion_id"] for st in candidate["stops"]] == wishes
    more = len(candidate["stops"]) > len(current)      # a dropped wish fits again
    fewer = len(candidate["stops"]) < len(current)
    over_cap = any(st["wait_min"] > MAX_WAIT_MIN for st in current)   # current plan walks into a 60+ min line
    if same or (fewer and not over_cap) or (saving < REROUTE_MIN_SAVING and not more and not over_cap):
        return None
    return current, candidate, saving


def _commit(visitor_id: str, candidate: dict, now: datetime) -> dict:
    led, meta = _ledger_for(now), _meta.setdefault(visitor_id, {})
    led.release(visitor_id, after=now)
    for st in candidate["stops"]:
        led.book(visitor_id, st["pavilion_id"], datetime.fromisoformat(st["arrive_at"]), meta.get("group", 1))
    _routes[visitor_id] = candidate
    meta["last_reroute"] = now
    return candidate


def maybe_reroute(visitor_id: str, now: datetime) -> tuple[dict, int] | None:
    """Uncapped, automatic version: re-plan if it saves REROUTE_MIN_SAVING+ minutes and the
    cooldown has passed. Used by experiments; the API uses offers (find_offer) instead."""
    last = _meta.get(visitor_id, {}).get("last_reroute")
    if last and now - last < timedelta(minutes=REROUTE_COOLDOWN_MIN):
        return None
    alt = _alternative(visitor_id, now)
    if not alt:
        return None
    _, candidate, saving = alt
    return _commit(visitor_id, candidate, now), saving


def refresh(visitor_id: str, now: datetime) -> dict | None:
    """Same stops, same order: update times and waits from now, and drop the least wanted
    stops that no longer fit. Done silently; only a change of ORDER becomes an offer."""
    route = _routes.get(visitor_id)
    if not route:
        return None
    meta = _meta.get(visitor_id, {})
    order = [st["pavilion_id"] for st in route["stops"]]
    priority = {w: i for i, w in enumerate(meta.get("wishlist", order))}
    here, end = _position(visitor_id, route), datetime.fromisoformat(route["end_time"])
    led = _ledger_for(now)
    led.release(visitor_id, after=now)
    stops = _materialize(visitor_id, order, here, now, end, meta.get("use_ledger", True))
    while stops and datetime.fromisoformat(stops[-1]["leave_at"]) > end:
        order.remove(max(order, key=lambda w: priority.get(w, 99)))
        stops = _materialize(visitor_id, order, here, now, end, meta.get("use_ledger", True))
    for st in stops:
        led.book(visitor_id, st["pavilion_id"], datetime.fromisoformat(st["arrive_at"]), meta.get("group", 1))
    planned = {st["pavilion_id"] for st in stops}
    requested = route["feasibility"]["requested"]
    route.update({
        "version": route["version"] + 1, "generated_at": _iso(now), "stops": stops,
        "totals": {"walk_min": sum(st["walk_from_prev_min"] for st in stops),
                   "wait_min": sum(st["wait_min"] for st in stops), "stops": len(stops)},
    })
    route["feasibility"]["fits"] = len(stops)
    route["feasibility"]["dropped"] = [w for w in meta.get("wishlist", []) if w not in planned
                                       and w not in set(meta.get("done", []))]
    route["feasibility"]["requested"] = requested
    return route


# ---------- reroute offers (what the app shows: "we found a better route", accept / keep) ----------
OFFER_TTL_MIN = 3            # an unanswered offer lapses after this
OFFER_COOLDOWN_MIN = 20      # after an offer (any answer), don't ask the same visitor again for a while
HEADROOM_EXTRA_WAIT_MIN = 5  # a redirect may raise a pavilion's wait by at most this much...
CAP_WINDOW_MIN = 15          # ...per window of this length; offers stop when that room is used up

_offers: dict[str, dict] = {}                 # offer_id -> offer
_cap: dict[tuple[str, int], float] = {}       # (pavilion, window) -> people held or moved in
_offer_seq = [0]


class OfferError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


def _window(t: datetime) -> int:
    led = _ledger_for(t)
    return int((t - led.day0).total_seconds() // (CAP_WINDOW_MIN * 60))


def headroom(pid: str, t: datetime) -> float:
    """People who can still be redirected to pid around time t before its wait rises by
    more than HEADROOM_EXTRA_WAIT_MIN."""
    allowed = HEADROOM_EXTRA_WAIT_MIN * rate_per_min(pid)
    return allowed - _cap.get((pid, _window(t)), 0.0)


def _new_loads(old_stops: list[dict], new_stops: list[dict]) -> list[tuple[str, datetime]]:
    """Stops the new route adds at a time window the old route didn't use: the extra load."""
    old = {(st["pavilion_id"], _window(datetime.fromisoformat(st["arrive_at"]))) for st in old_stops}
    out = []
    for st in new_stops:
        t = datetime.fromisoformat(st["arrive_at"])
        if (st["pavilion_id"], _window(t)) not in old:
            out.append((st["pavilion_id"], t))
    return out


def _brief(stops: list[dict]) -> list[dict]:
    return [{"pavilion_id": st["pavilion_id"], "arrive_at": st["arrive_at"], "wait_min": st["wait_min"]}
            for st in stops]


def expire_offers(now: datetime) -> None:
    for oid, o in list(_offers.items()):
        if now >= o["expires"]:
            _close_offer(oid, now, accepted=False)


def _close_offer(offer_id: str, now: datetime, accepted: bool) -> dict:
    o = _offers.pop(offer_id)
    if not accepted:                               # give the held room back
        for key, people in o["holds"]:
            _cap[key] = _cap.get(key, 0.0) - people
    meta = _meta.setdefault(o["visitor_id"], {})
    meta["last_offer"] = now
    meta.pop("open_offer", None)
    return o


def find_offer(visitor_id: str, now: datetime) -> dict | None:
    """A better route to OFFER the visitor, without changing anything they've agreed to.
    Holds room at the pavilions it sends them to; returns None if it isn't worth asking,
    if they were asked recently, or if those pavilions have no room left (the cap)."""
    expire_offers(now)
    meta = _meta.get(visitor_id, {})
    if meta.get("open_offer"):
        return None
    last = meta.get("last_offer")
    if last and now - last < timedelta(minutes=OFFER_COOLDOWN_MIN):
        return None
    alt = _alternative(visitor_id, now)
    if not alt:
        return None
    current, candidate, saving = alt
    people = meta.get("group", 1)
    loads = _new_loads(current, candidate["stops"])
    if any(headroom(pid, t) < people for pid, t in loads):
        return None                                  # room used up: keep this pavilion quiet
    holds = [((pid, _window(t)), people) for pid, t in loads]
    for key, n in holds:
        _cap[key] = _cap.get(key, 0.0) + n

    _offer_seq[0] += 1
    offer_id = f"o_{_offer_seq[0]}"
    planned = {st["pavilion_id"]: st["wait_min"] for st in _routes[visitor_id]["stops"]}
    worst = (max(current, key=lambda st: st["wait_min"] - planned.get(st["pavilion_id"], st["wait_min"]))
             if current else None)                  # the stop whose wait rose most since planning
    offer = {
        "offer_id": offer_id, "visitor_id": visitor_id,
        "expires_at": _iso(now + timedelta(minutes=OFFER_TTL_MIN)),
        "saves_min": saving,
        "trigger": ({"pavilion_id": worst["pavilion_id"], "wait_min": worst["wait_min"],
                     "planned_wait_min": planned.get(worst["pavilion_id"])} if worst else None),
        "old": _brief(current), "new": _brief(candidate["stops"]),
        "route": candidate,
    }
    _offers[offer_id] = {"visitor_id": visitor_id, "candidate": candidate, "holds": holds,
                         "expires": now + timedelta(minutes=OFFER_TTL_MIN), "public": offer}
    meta["open_offer"] = offer_id
    return offer


def _get_offer(visitor_id: str, offer_id: str, now: datetime) -> dict:
    expire_offers(now)
    o = _offers.get(offer_id)
    if not o or o["visitor_id"] != visitor_id:
        raise OfferError("offer_unavailable", "This offer expired or no longer exists")
    return o


def accept_offer(visitor_id: str, offer_id: str, now: datetime) -> dict:
    o = _get_offer(visitor_id, offer_id, now)
    route = _routes.get(visitor_id)
    if route is None or route["version"] != o["candidate"]["version"] - 1:
        _close_offer(offer_id, now, accepted=False)
        raise OfferError("offer_stale", "The plan changed since this offer was made")
    _close_offer(offer_id, now, accepted=True)     # held room becomes taken room
    return _commit(visitor_id, o["candidate"], now)


def decline_offer(visitor_id: str, offer_id: str, now: datetime) -> None:
    _get_offer(visitor_id, offer_id, now)
    _close_offer(offer_id, now, accepted=False)


def crowd_snapshot(now: datetime) -> list[dict]:
    out = []
    fc = Forecast(now)
    for pid in PAVILIONS:
        wait = round(fc.wait(pid, now))
        out.append({"pavilion_id": pid, "wait_min": wait,
                    "queue_length": round(wait * rate_per_min(pid)),
                    "status": "low" if wait < 15 else "medium" if wait < 40 else "high"})
    return out
