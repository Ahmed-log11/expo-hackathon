# INSYAB admin dashboard

The operator's view for the pitch. It shows:

- live crowd at every pavilion;
- the ML forecast;
- the ledger: who the engine is sending where over the next 2 hours, which is the load-balancing idea;
- demo controls.

It is web only (Vite + React + TypeScript) and Arabic-first, with an English toggle.

## Run

```bash
cd admin
npm install
npm run dev            # http://localhost:5173
```

By default it talks to the live API at `https://insyab-api.onrender.com`.

## Point it at another backend

Any of these works:

- add `?api=http://localhost:8000` to the page URL (handy on the day);
- run `VITE_API_URL=http://localhost:8000 npm run dev`;
- copy `.env.example` to `.env` and edit it.

To run the local backend, from the repo root: `python -m uvicorn api.main:app --host 0.0.0.0 --port 8000`.

`?lang=en` opens the dashboard in English. The default is Arabic, and the button in the top bar switches.

## What each part reads

| Part | Endpoint | Refresh |
| --- | --- | --- |
| Pavilions table: wait, people in line, status | `GET /crowd`, plus `GET /pavilions` once for names | 5 s |
| ML forecast column (now, +30, +60, +90) and detail chart | `GET /pavilions/{id}/forecast` | 60 s, and right after a spike |
| KPI tiles and ledger columns | `GET /admin/stats` (new, read-only; see `contract/README.md`) | 5 s, or 2 s while simulating |
| Site map | `/pavilions` and `/crowd`. Pin positions are the app's map positions (`src/mapPlaces.ts`) | with `/crowd` |

If the server doesn't have `/admin/stats` yet (Render before `app` is merged into `main`), the KPIs and ledger show a notice. Everything else still works.

## Demo controls (the "التحكم بالعرض / Demo controls" button)

- **Simulate +50 / +200** sends real `POST /visitors` requests, 6 at a time, like the app does:
  - 3–5 must-visit pavilions each, popular ones more often;
  - start now and leave after 4–6 h;
  - language Arabic.

  The ledger columns fill up as the visitors land.
- **Spike** calls `POST /debug/observe {pavilion_id, wait_min}`.
  - The row and the map pin turn red right away.
  - Phones heading there get a crowd alert and, when it's worth it, a reroute offer.
- **Reset** calls `POST /debug/reset` and needs two clicks. It clears measurements, offers and ledger bookings. Visitors and their saved minutes stay.
- **Demo token** is only needed if the server sets `DEMO_TOKEN`. You can also set it with `VITE_DEMO_TOKEN`.

Good to know on the day:

- The engine treats the Expo as open 10:00–24:00 Riyadh time. Outside those hours it refuses new visitors, so Simulate shows "the Expo is closed". This applies to Render too.
  - To rehearse before 10:00, run `python tools/api_at_time.py 14:00` (a local API with its clock moved to 14:00).
  - Then open the dashboard with `?api=http://localhost:8000`.
- Render's free plan sleeps after about 15 idle minutes. Open the dashboard a minute before the pitch so it wakes up.
- Every push to `main` redeploys Render and wipes its memory (visitors, ledger, offers).
- Offers go only to phones with the app open, because they arrive over the WebSocket. Simulated visitors fill the ledger but don't receive offers.

## Deploy (optional, after the merge to `main`)

Create a Render Static Site from the same repo with these settings:

- root directory: `admin`;
- build command: `npm install && npm run build`;
- publish directory: `dist`;
- environment variable: `VITE_API_URL=https://insyab-api.onrender.com`.
