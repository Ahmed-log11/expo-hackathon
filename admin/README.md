# INSYAB admin dashboard

The operator's view for the pitch: web only (Vite + React + TypeScript), Arabic, one page.

- **KPI tiles:** minutes of waiting saved, visitors on site, reroute offers (sent / accepted), average wait now.
- **Pavilions table:**
  - the live wait and queue at every pavilion;
  - the ML forecast (now, +30, +60, +90 min);
  - the **ledger**: how many visitors the engine has already booked to arrive at each pavilion in each 15-minute slot of the next 2 hours. This is the load-balancing idea.
- **Simulation tools** (hidden; add `?demo` to the URL): simulate visitors, spike a pavilion, reset. They exist for rehearsals and the live demo, not for normal operator use.

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

## What it reads

| Part | Endpoint | Refresh |
| --- | --- | --- |
| Table: wait, people in line, status | `GET /crowd`, plus `GET /pavilions` once for names | 5 s |
| Forecast column (now, +30, +60, +90) | `GET /pavilions/{id}/forecast` | 60 s, and right after a spike or reset |
| KPI tiles and ledger columns | `GET /admin/stats` (new, read-only; see `contract/README.md`) | 5 s, or 2 s while simulating |

If the server doesn't have `/admin/stats` yet (Render before `app` is merged into `main`), the KPI tiles show "—" and the ledger stays empty. Everything else still works.

## Simulation tools (`?demo`)

Open the dashboard with `?demo` (for example `http://localhost:5173/?demo`) and an "أدوات المحاكاة" button appears in the top bar. It opens a panel at the bottom with three tools:

- **Simulate +50 / +200** sends real `POST /visitors` requests, 6 at a time, like the app does:
  - 3–5 must-visit pavilions each, popular ones more often;
  - start now and leave after 4–6 h;
  - language Arabic.

  The ledger columns fill up as the visitors land.
- **Spike** calls `POST /debug/observe {pavilion_id, wait_min}`. The row turns red right away. Phones heading there get a crowd alert and, when it's worth it, a reroute offer.
- **Reset** calls `POST /debug/reset` and needs two clicks. It clears measurements, offers and ledger bookings. Visitors and their saved minutes stay.
- **Demo token** is only needed if the server sets `DEMO_TOKEN`. Type it into the field and the browser remembers it. Never put it in a build variable on a public site: it would be baked into the page's JavaScript.

Good to know on the day:

- The engine treats the Expo as open 10:00–24:00 Riyadh time. Outside those hours it refuses new visitors, so Simulate shows "the Expo is closed". This applies to Render too.
  - To rehearse before 10:00, run `python tools/api_at_time.py 14:00` (a local API with its clock moved to 14:00).
  - Then open the dashboard with `?api=http://localhost:8000`.
- Render's free plan sleeps after about 15 idle minutes. Open the dashboard a minute before the pitch so it wakes up.
- Every push to `main` redeploys Render and wipes its memory (visitors, ledger, offers).
- Spike, Reset and Simulate act on the shared server, so they also affect teammates testing on their phones.
- Offers go only to phones with the app open, because they arrive over the WebSocket. Simulated visitors fill the ledger but don't receive offers.

## Deploy (optional, after the merge to `main`)

Create a Render Static Site from the same repo with these settings:

- root directory: `admin`;
- build command: `npm install && npm run build`;
- publish directory: `dist`;
- environment variable: `VITE_API_URL=https://insyab-api.onrender.com`.
