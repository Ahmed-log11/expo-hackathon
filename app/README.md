# app/ — INSYAB iPhone app

React Native + Expo (SDK 57), built from the Figma file "INSYAB — Expo 2030 Riyadh". Arabic-first, right-to-left, designed for iPhone (402 × 874 pt frames, scaled to every iPhone size).

## Run it on an iPhone

1. Install **Expo Go** from the App Store.
2. From this folder:
   ```bash
   npm install        # first time only
   npx expo start
   ```
3. Scan the QR code with the iPhone camera. The phone and the laptop must be on the same Wi-Fi.
   If the network blocks it (common on public or university Wi-Fi), use `npx expo start --tunnel`.

## Demo mode and live mode

- **Demo mode (default).** No server needed. The app replays the story drawn in the prototype: Saudi → Japan → Korea, Japan gets crowded, the visitor is offered Korea first and saves 26 minutes.
- **Live mode.** The app talks to the team API (`api/`, see `contract/README.md`).
  1. From the repo root, start the API so the phone can reach it:
     ```bash
     python -m uvicorn api.main:app --host 0.0.0.0 --port 8000
     ```
  2. Create `app/.env` (it is git-ignored):
     ```
     EXPO_PUBLIC_API_URL=http://<your-laptop-ip>:8000
     ```
     Use the Render URL instead once the API is deployed. If the server sets `DEMO_TOKEN`, also add `EXPO_PUBLIC_DEMO_TOKEN=<token>`.
  3. Restart with a clean cache: `npx expo start -c`.

## Demo walkthrough

| Step | Tap |
| --- | --- |
| Splash → Welcome | wait 2 s |
| Location permission | ابدأ → السماح أثناء الاستخدام |
| Home | خطط يومي (tap the live-status pill to see the "crowd high" state) |
| Wizard | التالي on each step → أنشئ خطتي (tap a time to change it) |
| Plan ready | ابدأ الرحلة |
| Navigation | ابدأ التوجيه → tap the instruction card to walk on |
| Arrive | tap the bottom card → بدأت الزيارة → المحطة التالية |
| Smart reroute | on the next leg: ابدأ التوجيه, then tap the instruction card twice. The second tap makes the next stop's queue jump (`POST /debug/observe`) and the reroute plays: crowd rising → searching → new route → offer |
| Accept | اعتمد المسار الجديد → tap the card to arrive |
| Day summary | the ✕ button on the map (in demo mode, ابدأ التوجيه after two visits jumps to the end of the day, as in the prototype) |

## Structure

| Folder | What it holds |
| --- | --- |
| `src/theme` | Design tokens from Figma: colours, Arabic type styles, shadows, glass, motion timings and curves |
| `src/components` | Component kit (buttons, glass, chips, crowd pills, Next Stop card, reroute card, tab bar) |
| `src/screens` | Onboarding, Home, planning wizard, plan result, live journey, arrival and summary, pavilion, explore, profile |
| `src/map` | The illustrated map, heat, routes drawn along the walkways, markers |
| `src/data` | API client, demo-mode backend, app state, place names and photos |
| `src/nav` | Screen transitions as in the prototype (push from the left, move-in, dissolve) |
| `assets/map`, `assets/images` | Map artwork rendered from Figma at 3x, official concept renders |

`src/data/mapLayout.ts` and `src/assets/svg.ts` are generated from the Figma file (walkway graph and pavilion positions; icons, logo and motion line art). Pavilion names and tags come from `../sim/pavilions.json`.

## Known gaps (design vs backend)

- The pavilion wait forecast (+30 / +60 min) is shaped from the current wait; the API has no forecast endpoint yet.
- Comfort preferences (shade, accessibility…) are kept in the app; `POST /visitors` has no field for them yet.
- Explore and Favorites use local data.
