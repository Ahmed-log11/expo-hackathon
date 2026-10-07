# app/ — mobile frontend

Framework decision pending (React Native + Expo vs mobile-first web, decided ~5 Oct).

Screens to build:
1. Interests: chat or pick pavilions
2. Feasibility result: "you can see 6 of 8 today"
3. Main: map with crowd colors + route + next-stop card
4. Navigation: landmark directions, shaded path indicator
5. Reroute alert: change + reason
6. Adjust plan: natural-language change + preview (accept / cancel)

Rules:
- No logic here. Everything comes from the API (see contract/).
- Build against the example JSON in contract/ until the real API is ready.
