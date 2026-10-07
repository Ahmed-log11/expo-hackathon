# api/main.py — FastAPI entry point
#
# The ONLY thing the app talks to. Keeps no logic of its own:
# each endpoint calls into engine/ (and llm/ for language).
#
# REST endpoints (shapes defined in contract/README.md):
#   GET  /pavilions                  -> engine crowd state
#   POST /visitors                   -> llm parses interests, engine checks feasibility
#   POST /plan                       -> engine builds route, llm writes summary (non-blocking)
#   GET  /visitors/{id}/next         -> next-stop card
#   POST /visitors/{id}/location     -> location ping into crowd state
#   POST /visitors/{id}/checkin      -> scan-like event into crowd state
#   POST /visitors/{id}/adjust       -> llm tool calls -> engine re-plan -> preview
#
# WebSocket:
#   /live/{visitor_id}               -> pushes crowd_update and reroute messages
#
# Start with a STUB version: every endpoint returns the example JSON
# from contract/, so the frontend can connect from day one.
