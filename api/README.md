# api/ — how to run

```bash
pip install -r requirements.txt
cp .env.example .env          # optional: add ANTHROPIC_API_KEY; without it the keyword fallback runs
uvicorn api.main:app --reload # from the repo root
```

- Docs: http://localhost:8000/docs
- Quick check: http://localhost:8000/pavilions
- Live test: `python tools/ws_client.py` (creates a visitor, prints live messages, triggers a reroute)
- LLM alone: `python llm/wishlist.py "أحب التاريخ والآثار"`

## Deploy (Render)

1. Push to GitHub. In Render: New → Blueprint → pick the repo (it reads `render.yaml`).
2. In the service's Environment tab set `ANTHROPIC_API_KEY` (and `DEMO_TOKEN` if you want /debug locked).
3. Open `https://<name>.onrender.com/health` from a phone on mobile data.

Railway: New Project → Deploy from GitHub; it uses `Procfile`. Set the same variables.

Free Render instances sleep after ~15 min idle and take ~30–60 s to wake. Open /health before a demo.
State is in memory: a restart or redeploy forgets all visitors. Fine for the hackathon.
