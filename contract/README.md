# Data contract: app ↔ API

The source of truth for every shape the app and API exchange. Full examples live in `examples/`; they were generated from the running API, so they match the code exactly. **Any change is announced in the group chat before it's merged.**

## Settled decisions

The team's earlier proposal (separate `POST /plan`, `/checkin`, `/location`, `crowd_level` on `/pavilions`) is not reconciled yet. Agree on one version before integration.

| Topic | Decision |
| --- | --- |
| Coordinates | `x`, `y` on a 0–100 grid, origin top-left. The app scales to screen size. |
| Language | `language: "ar" \| "en"`, set once at `POST /visitors`. All visitor-facing text (`reason`, `explanation`) comes back in that language. Places carry both `name_en` and `name_ar`. |
| Visitor IDs | Server-generated, `v_` + 10 hex chars (`v_21d7df26d7`). The app stores it locally. No accounts. |
| Times | ISO 8601 with Riyadh offset (`2026-10-15T19:33:24+03:00`). Durations are integer minutes, named `*_min`. |
| Site data | `sim/pavilions.json` (team version) is the source of truth. IDs are as in that file: lowercase (`jp`, `th_technology`, `metro`). |
| Pavilions vs landmarks | A place with `has_queue: true` is a pavilion and can be on a route. `has_queue: false` places (`icon`, `stage`, `metro`, ...) are landmarks for directions and start points. |
| Errors | Always `{"error": {"code": "...", "message": "..."}}` with a matching HTTP status. See `examples/error.json`. |

## REST endpoints

| Method | Path | Purpose | Example |
| --- | --- | --- | --- |
| GET | `/health` | Liveness, engine and LLM mode | — |
| GET | `/pavilions` | Static site: `districts`, `pavilions` (queued places), `landmarks` | `GET_pavilions.json` |
| GET | `/crowd` | Current wait per pavilion | `GET_crowd.json` |
| POST | `/visitors` | Interests → wishlist → route | `POST_visitors.request.json` / `.response.json` |
| GET | `/visitors/{id}/route` | Current full route | `GET_visitor_route.json` |
| GET | `/visitors/{id}/next` | Next-stop card | `GET_visitor_next.json` |
| POST | `/visitors/{id}/events` | Visitor `entered` / `left` a pavilion | `POST_visitor_events.*` |
| POST | `/visitors/{id}/adjust` | "Adjust my plan" preview (stub until C7) | `POST_visitor_adjust.*` |
| POST | `/visitors/{id}/offers/{offer_id}/accept` | Visitor took the new route; returns it (version + 1). `410` `offer_unavailable` (expired / gone) or `offer_stale` (plan changed) | `POST_offer_accept.response.json` |
| POST | `/visitors/{id}/offers/{offer_id}/decline` | Visitor kept their plan; `{"ok": true}`. Same `410` errors | — |

### POST /visitors

Request: `interests` (required, free text, Arabic or English), `language` (default `en`), `end_time` (optional, default now + 4 h), `start_point` (any place ID, default `metro`).

Response: `visitor_id`, `wishlist` (4–8 items, `{pavilion_id, reason}`, most relevant first), `wishlist_source` (`llm` or `fallback`), `route`.

### Route object

| Field | Meaning |
| --- | --- |
| `version` | Increments on every replan. The app ignores a reroute with a version ≤ the one it has. |
| `stops[]` | `order, pavilion_id, walk_from_prev_min, arrive_at, wait_min, visit_min, leave_at, path[], landmarks[]`. `path` and `landmarks` hold place IDs; the app shows `name_en` or `name_ar` from `/pavilions`. `shaded_pct` = share of the walk in shade. |
| `totals` | `walk_min, wait_min, stops` |
| `feasibility` | `fits, requested, dropped[], too_busy[]`. `dropped` = every wish not on the route; `too_busy` = the subset skipped because the queue is over 60 min all day ("Germany is over an hour all day; skipped"). |
| `summary` | `null` for now. Will hold the LLM summary, filled after the route (the app never waits on it). |

## WebSocket: `/live/{visitor_id}`

Connect after `POST /visitors`. Unknown visitor → closed with code `4404`. On connect the server sends one `crowd_update` immediately. The client may send anything as a ping; it's ignored.

| `type` | Sent to | When | Example |
| --- | --- | --- | --- |
| `crowd_update` | Everyone | On a timer (`CROWD_INTERVAL_S`, default 10 s) | `WS_crowd_update.json` |
| `crowd_alert` | Visitors whose NEXT stop just got 10+ min busier | When a new measurement arrives | `WS_crowd_alert.json` |
| `reroute_offer` | One visitor | The engine found a better ORDER that saves 10+ min, and the pavilions it redirects to still have room | `WS_reroute_offer.json` |
| `reroute` | One visitor | Only from `/debug/reroute` (testing). The app's real flow is `reroute_offer` | `WS_reroute.json` |

`crowd_update.pavilions[]`: `pavilion_id, wait_min, queue_length, status` (`low` < 15 min ≤ `medium` < 40 min ≤ `high`).

`reroute_offer`: `offer_id, expires_at, reason` (visitor's language), `saves_min`, `trigger {pavilion_id, wait_min, planned_wait_min}` (the stop that got busier), `old[]` and `new[]` (`pavilion_id, arrive_at, wait_min` per stop, for the before/after card), `route` (the full new route, shown only if accepted).

How offers work: nothing changes until the visitor accepts. Each offer holds room at the pavilions it redirects to; once a pavilion's room for a 15-minute window is used up (about +5 min of wait), no more offers send people there. That is what makes "we suggest this to a limited number of visitors" true. Unanswered offers lapse after 3 minutes (accept then returns `410 offer_unavailable`: show "this route filled up, keeping your plan"). After any offer, the same visitor isn't asked again for 20 minutes.

Times on the current route are refreshed silently (same stops, same order); only a change of order is ever an offer.

`reroute` (debug only): `visitor_id, reason, saves_min, route`.

## Engine interface (B → C)

The API calls only these, from the `engine/` package (`api/engine_mock.py` is the old stand-in).

```python
plan(visitor_id, wishlist: list[str], start_time, end_time, start_point="metro") -> Route
next_stop(visitor_id) -> NextStop | None    # includes shaded_pct
replan(visitor_id, constraints: dict | None = None, now=None) -> Route
refresh(visitor_id, now) -> Route                  # same order, new times
find_offer(visitor_id, now) -> Offer | None        # holds room; never changes the route
accept_offer(visitor_id, offer_id, now) -> Route   # raises OfferError(code)
decline_offer(visitor_id, offer_id, now) -> None
expire_offers(now); observe(pavilion_id, wait_min, at)
get_route(visitor_id) -> Route | None
mark_left(visitor_id, pavilion_id) -> None
crowd_snapshot(now) -> list[PavilionCrowd]
SITE                          # parsed sim/pavilions.json
POINTS, PAVILIONS, LANDMARKS  # id -> place dicts: all / has_queue / no queue
DEFAULT_START                 # "metro"
```

`wishlist` is in priority order. When it doesn't fit, drop from the end.

## Demo-only endpoints

- `POST /debug/observe` `{"pavilion_id": "jp", "wait_min": 38}`: set a measured wait now. Sends `crowd_alert` to visitors heading there, pushes `crowd_update`, then looks for `reroute_offer`s. This drives the live demo; the simulator calls it too.
- `POST /debug/reroute/{id}`: force an applied reroute (testing only).
- `POST /debug/crowd`: push a crowd update now.

If `DEMO_TOKEN` is set, pass `?token=...`. Not for the app.
