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

### POST /visitors

Request: `interests` (required, free text, Arabic or English), `language` (default `en`), `end_time` (optional, default now + 4 h), `start_point` (any place ID, default `metro`).

Response: `visitor_id`, `wishlist` (4–8 items, `{pavilion_id, reason}`, most relevant first), `wishlist_source` (`llm` or `fallback`), `route`.

### Route object

| Field | Meaning |
| --- | --- |
| `version` | Increments on every replan. The app ignores a reroute with a version ≤ the one it has. |
| `stops[]` | `order, pavilion_id, walk_from_prev_min, arrive_at, wait_min, visit_min, leave_at, path[], landmarks[]`. `path` and `landmarks` hold place IDs; the app shows `name_en` or `name_ar` from `/pavilions`. |
| `totals` | `walk_min, wait_min, stops` |
| `feasibility` | `fits, requested, dropped[]`. If `dropped` is non-empty, show "you can see 3 of 8 today". |
| `summary` | `null` for now. Will hold the LLM summary, filled after the route (the app never waits on it). |

## WebSocket: `/live/{visitor_id}`

Connect after `POST /visitors`. Unknown visitor → closed with code `4404`. On connect the server sends one `crowd_update` immediately. The client may send anything as a ping; it's ignored.

| `type` | Sent to | When | Example |
| --- | --- | --- | --- |
| `crowd_update` | Everyone | On a timer (`CROWD_INTERVAL_S`, default 10 s) | `WS_crowd_update.json` |
| `reroute` | Affected visitor only | When the engine changes their route | `WS_reroute.json` |

`crowd_update.pavilions[]`: `pavilion_id, wait_min, queue_length, status` (`low` < 15 min ≤ `medium` < 40 min ≤ `high`).

`reroute`: `visitor_id, reason` (in the visitor's language), `saves_min`, `route` (full new route object).

## Engine interface (B → C)

The API calls only these. `api/engine_mock.py` implements them today; B's module replaces it in C6.

```python
plan(visitor_id, wishlist: list[str], start_time, end_time, start_point="metro") -> Route
next_stop(visitor_id) -> NextStop | None
replan(visitor_id, constraints: dict | None = None, now=None) -> Route
get_route(visitor_id) -> Route | None
mark_left(visitor_id, pavilion_id) -> None
crowd_snapshot(now) -> list[PavilionCrowd]
SITE                          # parsed sim/pavilions.json
POINTS, PAVILIONS, LANDMARKS  # id -> place dicts: all / has_queue / no queue
DEFAULT_START                 # "metro"
```

`wishlist` is in priority order. When it doesn't fit, drop from the end.

## Demo-only endpoints

`POST /debug/reroute/{id}` forces a reroute push. `POST /debug/crowd` pushes a crowd update now. If `DEMO_TOKEN` is set, pass `?token=...`. Not for the app.
