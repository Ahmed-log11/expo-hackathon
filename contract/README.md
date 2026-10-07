# Data contract

This file is the agreement between the app (`app/`) and the backend (`api/`).
Frontend builds against it with fake data; backend returns exactly these shapes.
**Any change here must be announced to the whole team.**

Fields below are a starting proposal. Finalize them together before splitting up,
then add one example JSON file per response in this folder (e.g. `pavilions.example.json`).

---

## REST endpoints

### `GET /pavilions`
Current crowd state for the map.
Each pavilion: `id`, `name`, `district`, `location` (x/y or lat/lng), `current_wait_min`,
`predicted_wait_min`, `crowd_level` (low / medium / high), `is_open`, `is_indoor`.

### `POST /visitors`
Visitor sends their interests (free text or picked pavilions).
Returns: `visitor_id`, parsed `wishlist`, and a `feasibility` result
(how many fit today + a short explanation).

### `POST /plan`
Returns the visitor's route: ordered `stops` (pavilion, planned arrival, expected wait),
`next_stop`, `total_time_min`, `summary` (LLM text, may arrive later).

### `GET /visitors/{id}/next`
The single next-stop card: `pavilion`, `walk_min`, `expected_wait_min`,
`directions` (landmark-based), `shaded` (yes/no).

### `POST /visitors/{id}/location`
App sends a location ping (simulated in the demo).

### `POST /visitors/{id}/checkin`
Visitor arrived at / finished a pavilion (stands in for the QR scan).

### `POST /visitors/{id}/adjust`
Visitor's change request in natural language ("skip Germany", "I'm tired").
Returns a **preview** of the new plan + explanation; the visitor accepts or cancels.

---

## WebSocket messages (`/live/{visitor_id}`)

### `crowd_update`
Updated crowd levels for the map (same pavilion fields as `GET /pavilions`).

### `reroute`
`old_next_stop`, `new_next_stop`, `time_saved_min`, `reason`
(template text first, nicer LLM wording may follow).

---

## Open decisions
- Map coordinates: simple x/y on our own site drawing, or real lat/lng?
- Language field: does the app send `ar` / `en` with every request?
- How visitors are identified in the demo (simple generated id is enough).
