"""
Expo 2030 crowd-balancing API. The only thing the app talks to.

Run:  uvicorn api.main:app --reload        (from the repo root)
Docs: http://localhost:8000/docs

Routing comes from the engine/ package (B). api/engine_mock.py is the old stand-in.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import sys
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import engine  # B's engine (api/engine_mock.py is the old stand-in)  # noqa: E402
from llm.wishlist import CHIPS, extract_wishlist, from_chips  # noqa: E402

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("api")

RIYADH = timezone(timedelta(hours=3))
CROWD_INTERVAL_S = float(os.getenv("CROWD_INTERVAL_S", "10"))
DEMO_TOKEN = os.getenv("DEMO_TOKEN", "")  # protects /debug endpoints when set

visitors: dict[str, dict] = {}  # visitor_id -> {language, wishlist, created_at}


def now() -> datetime:
    return datetime.now(RIYADH).replace(microsecond=0)


def err(status: int, code: str, message: str) -> HTTPException:
    return HTTPException(status_code=status, detail={"code": code, "message": message})


# ---------- live connections (C5) ----------
class Live:
    def __init__(self) -> None:
        self.conns: dict[str, set[WebSocket]] = {}

    async def connect(self, vid: str, ws: WebSocket) -> None:
        await ws.accept()
        self.conns.setdefault(vid, set()).add(ws)

    def drop(self, vid: str, ws: WebSocket) -> None:
        self.conns.get(vid, set()).discard(ws)
        if not self.conns.get(vid):
            self.conns.pop(vid, None)

    async def _send(self, vid: str, ws: WebSocket, msg: dict) -> None:
        try:
            await ws.send_json(msg)
        except Exception:
            self.drop(vid, ws)

    async def to_visitor(self, vid: str, msg: dict) -> int:
        targets = list(self.conns.get(vid, ()))
        await asyncio.gather(*(self._send(vid, ws, msg) for ws in targets))
        return len(targets)

    async def broadcast(self, msg: dict) -> None:
        await asyncio.gather(*(self._send(v, ws, msg) for v, s in list(self.conns.items()) for ws in list(s)))


live = Live()


def crowd_message() -> dict:
    return {"type": "crowd_update", "updated_at": now().isoformat(), "pavilions": engine.crowd_snapshot(now())}


def _name(pid: str, vid: str) -> str:
    p = engine.POINTS.get(pid, {})
    return p.get("name_ar" if visitors.get(vid, {}).get("language") == "ar" else "name_en", pid)


def offer_reason(vid: str, offer: dict) -> str:
    trig = offer.get("trigger") or {}
    name, saves = _name(trig.get("pavilion_id", ""), vid), offer["saves_min"]
    if visitors.get(vid, {}).get("language") == "ar":
        return f"ارتفع الازدحام المتوقع في {name}. المسار الجديد قد يوفر لك {saves} دقيقة."
    return f"Crowding is rising at {name}. The new route could save you {saves} minutes."


async def push_offers() -> int:
    """Ask the engine for a better route for every connected visitor; send offers, not changes.
    The engine enforces the cap per pavilion and a cooldown per visitor."""
    sent = 0
    for vid in list(live.conns):
        offer = engine.find_offer(vid, now())
        if offer:
            sent += await live.to_visitor(vid, {"type": "reroute_offer", "reason": offer_reason(vid, offer), **offer})
    return sent


async def crowd_loop() -> None:
    """Every tick: push crowd levels to everyone, then look for reroute offers."""
    while True:
        await asyncio.sleep(CROWD_INTERVAL_S)
        engine.expire_offers(now())
        if not live.conns:
            continue
        await live.broadcast(crowd_message())
        await push_offers()


@asynccontextmanager
async def lifespan(_: FastAPI):
    engine.crowd_snapshot(now())   # warm-up: loads the ML model now, not on the first visitor
    task = asyncio.create_task(crowd_loop())
    yield
    task.cancel()


app = FastAPI(title="Expo 2030 Crowd-Balancing API", version="0.1.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.exception_handler(HTTPException)
async def http_error(_: Request, exc: HTTPException):
    detail = exc.detail if isinstance(exc.detail, dict) else {"code": "error", "message": str(exc.detail)}
    return JSONResponse(status_code=exc.status_code, content={"error": detail})


@app.exception_handler(RequestValidationError)
async def validation_error(_: Request, exc: RequestValidationError):
    first = exc.errors()[0]
    field = ".".join(str(x) for x in first["loc"][1:]) or "body"
    return JSONResponse(status_code=422, content={"error": {"code": "invalid_request",
                                                            "message": f"{field}: {first['msg']}"}})


# ---------- request models ----------
MAX_WISHES = 8


class NewVisitor(BaseModel):
    """At least one of interests / interest_tags / must_visit is required."""
    interests: str | None = Field(default=None, max_length=1000)        # free text (LLM)
    interest_tags: list[str] = Field(default_factory=list)                # wizard chips
    must_visit: list[str] = Field(default_factory=list, max_length=MAX_WISHES)  # picked pavilions
    language: Literal["ar", "en"] = "en"
    start_time: datetime | None = None   # default: now; may be later today or another day
    end_time: datetime | None = None     # default: start + 4 hours
    start_point: str = engine.DEFAULT_START
    group_size: int = Field(default=1, ge=1, le=20)


class VisitEvent(BaseModel):
    type: Literal["arrived", "entered", "left"]   # joined the line / got in / finished
    pavilion_id: str
    at: datetime | None = None                    # default: now (the app may send the scan time)


class AdjustRequest(BaseModel):
    text: str = Field(min_length=2, max_length=500)


def _visitor(vid: str) -> dict:
    if vid not in visitors:
        raise err(404, "visitor_not_found", f"No visitor {vid}")
    return visitors[vid]


# ---------- REST ----------
@app.get("/health")
def health():
    return {"status": "ok", "time": now().isoformat(), "engine": engine.__name__,
            "walkways": engine.GRAPH_SOURCE,
            "llm": "on" if os.getenv("ANTHROPIC_API_KEY") else "fallback"}


@app.get("/pavilions")
def pavilions():
    """Static site data. pavilions = queued places; landmarks = map points for directions."""
    return {"districts": engine.SITE["districts"],
            "pavilions": list(engine.PAVILIONS.values()),
            "landmarks": list(engine.LANDMARKS.values())}


@app.get("/crowd")
def crowd():
    msg = crowd_message()
    return {"updated_at": msg["updated_at"], "pavilions": msg["pavilions"]}


def build_wishlist(body: NewVisitor) -> tuple[list[dict], str]:
    """Picked pavilions first, then what the free text asks for, then interest chips.
    Each item: {pavilion_id, reason, source}. Returns (items, source of the text part)."""
    ar = body.language == "ar"
    items: list[dict] = [{"pavilion_id": pid, "reason": "اخترته بنفسك" if ar else "You picked it",
                          "source": "picked"} for pid in dict.fromkeys(body.must_visit)]
    text_source = "none"
    queued = list(engine.PAVILIONS.values())
    if body.interests and body.interests.strip():
        wl = extract_wishlist(body.interests, body.language, queued)
        text_source = wl["source"]
        items += [{**w, "source": text_source} for w in wl["items"]]
    if body.interest_tags:
        items += [{**w, "source": "interests"} for w in from_chips(body.interest_tags, body.language, queued)]
    seen, out = set(), []
    for it in items:
        if it["pavilion_id"] not in seen:
            seen.add(it["pavilion_id"])
            out.append(it)
    picked = [i for i in out if i["source"] == "picked"]
    return picked + [i for i in out if i["source"] != "picked"][:max(0, MAX_WISHES - len(picked))], text_source


@app.post("/visitors", status_code=201)
def create_visitor(body: NewVisitor):
    if body.start_point not in engine.POINTS:
        raise err(422, "unknown_start_point", f"Unknown start_point {body.start_point}")
    unknown = [p for p in body.must_visit if p not in engine.PAVILIONS]
    if unknown:
        raise err(422, "unknown_pavilion", f"Unknown pavilion(s) in must_visit: {', '.join(unknown)}")
    bad_tags = [t for t in body.interest_tags if t not in CHIPS]
    if bad_tags:
        raise err(422, "unknown_interest", f"Unknown interest_tags: {', '.join(bad_tags)}; use {', '.join(CHIPS)}")
    if not ((body.interests or "").strip() or body.interest_tags or body.must_visit):
        raise err(422, "empty_interests", "Send interests, interest_tags or must_visit")

    current = now()
    start = body.start_time.astimezone(RIYADH) if body.start_time else current
    if start < current - timedelta(minutes=5):
        raise err(422, "start_time_in_past", "start_time must be now or later")
    if start > current + timedelta(days=30):
        raise err(422, "start_time_too_far", "Plans can be made up to 30 days ahead")
    start = max(start, current)
    end = body.end_time.astimezone(RIYADH) if body.end_time else start + timedelta(hours=4)
    if end <= start:
        raise err(422, "end_time_in_past", "end_time must be after start_time")
    open_start, open_end = engine.opening_hours(start, end)
    if open_end <= open_start:
        raise err(422, "outside_opening_hours", "The Expo is closed for that whole time")

    wishlist, text_source = build_wishlist(body)
    vid = "v_" + uuid.uuid4().hex[:10]
    route = engine.plan(vid, [w["pavilion_id"] for w in wishlist], start, end, body.start_point,
                        group_size=body.group_size, picked=list(body.must_visit))
    visitors[vid] = {"language": body.language, "wishlist": wishlist, "created_at": current.isoformat()}
    return {"visitor_id": vid, "language": body.language, "wishlist": wishlist,
            "wishlist_source": text_source, "route": route}


@app.get("/visitors/{vid}/route")
def get_route(vid: str):
    _visitor(vid)
    return engine.get_route(vid)


@app.get("/visitors/{vid}/next")
def get_next(vid: str):
    _visitor(vid)
    stop = engine.next_stop(vid)
    if stop is None:
        raise err(404, "route_finished", "No stops left")
    return stop


@app.post("/visitors/{vid}/events")
def visit_event(vid: str, body: VisitEvent):
    _visitor(vid)
    if body.pavilion_id not in engine.PAVILIONS:
        raise err(422, "unknown_pavilion", f"Unknown pavilion {body.pavilion_id}")
    at = body.at.astimezone(RIYADH) if body.at else now()
    engine.record_event(vid, body.type, body.pavilion_id, at)
    return {"ok": True, "at": at.isoformat()}


@app.get("/visitors/{vid}/summary")
def visitor_summary(vid: str):
    """The day so far / end of day: visited pavilions, real or estimated waits, km, minutes saved."""
    _visitor(vid)
    return engine.summary(vid, now())


@app.post("/visitors/{vid}/adjust")
def adjust(vid: str, body: AdjustRequest):
    """C7 stub: shape only. Returns a fixed preview so the app can build the screen."""
    v = _visitor(vid)
    route = engine.get_route(vid)
    explanation = ("هذه معاينة تجريبية؛ ميزة التعديل قيد التطوير." if v["language"] == "ar"
                   else "Preview only: plan adjustment is not live yet.")
    return {"preview_id": "p_" + uuid.uuid4().hex[:8], "visitor_id": vid, "tool_calls": [],
            "explanation": explanation, "route": route}


@app.post("/visitors/{vid}/offers/{offer_id}/accept")
def accept_offer(vid: str, offer_id: str):
    """Visitor tapped "use the new route". Returns the new route (version + 1)."""
    _visitor(vid)
    try:
        return engine.accept_offer(vid, offer_id, now())
    except engine.OfferError as e:
        raise err(410, e.code, str(e))


@app.post("/visitors/{vid}/offers/{offer_id}/decline")
def decline_offer(vid: str, offer_id: str):
    """Visitor tapped "keep my plan". Nothing changes; we won't ask again for a while."""
    _visitor(vid)
    try:
        engine.decline_offer(vid, offer_id, now())
    except engine.OfferError as e:
        raise err(410, e.code, str(e))
    return {"ok": True}


# ---------- debug (demo + testing) ----------
def _check_token(token: str | None) -> None:
    if DEMO_TOKEN and token != DEMO_TOKEN:
        raise err(403, "forbidden", "Bad demo token")


@app.post("/debug/reroute/{vid}")
async def debug_reroute(vid: str, token: str | None = None):
    """Force a reroute push to one visitor. Removes their next stop and re-plans."""
    _check_token(token)
    _visitor(vid)
    old = engine.get_route(vid)
    if not old["stops"]:
        raise err(409, "route_finished", "No stops to reroute")
    skipped = old["stops"][0]["pavilion_id"]
    new = engine.replan(vid, {"remove": [skipped]}, now())
    name = engine.PAVILIONS[skipped]["name_ar" if visitors[vid]["language"] == "ar" else "name_en"]
    reason = (f"ازداد الانتظار في {name}، عدّلنا مسارك." if visitors[vid]["language"] == "ar"
              else f"{name}'s wait jumped, so we updated your route.")
    sent = await live.to_visitor(vid, {"type": "reroute", "visitor_id": vid, "reason": reason,
                                       "saves_min": 12, "route": new})
    return {"sent_to_connections": sent, "route_version": new["version"]}


class Observation(BaseModel):
    pavilion_id: str
    wait_min: float = Field(ge=0, le=300)


@app.post("/debug/observe")
async def debug_observe(body: Observation, token: str | None = None):
    """Demo control: set a pavilion's measured wait right now (the simulator calls this too).
    Warns visitors heading there, pushes fresh crowd levels, then looks for reroute offers."""
    _check_token(token)
    if body.pavilion_id not in engine.PAVILIONS:
        raise err(422, "unknown_pavilion", f"Unknown pavilion {body.pavilion_id}")
    engine.observe(body.pavilion_id, body.wait_min, now())
    alerts = 0
    for vid in list(live.conns):
        nxt = engine.next_stop(vid)
        if nxt and nxt["pavilion_id"] == body.pavilion_id and body.wait_min >= nxt["wait_min"] + 10:
            alerts += await live.to_visitor(vid, {"type": "crowd_alert", "pavilion_id": body.pavilion_id,
                                                  "wait_min": round(body.wait_min),
                                                  "planned_wait_min": nxt["wait_min"]})
    await live.broadcast(crowd_message())
    return {"alerts": alerts, "offers": await push_offers()}


@app.post("/debug/crowd")
async def debug_crowd(token: str | None = None):
    """Push a crowd_update to everyone right now instead of waiting for the timer."""
    _check_token(token)
    await live.broadcast(crowd_message())
    return {"connections": sum(len(s) for s in live.conns.values())}


@app.post("/debug/reset")
async def debug_reset(token: str | None = None):
    """Demo control: clear observations, offers and ledger bookings, then push fresh crowd levels."""
    _check_token(token)
    engine.clear_live_state()
    await live.broadcast(crowd_message())
    return {"ok": True}


# ---------- WebSocket (C5) ----------
@app.websocket("/live/{vid}")
async def live_ws(ws: WebSocket, vid: str):
    if vid not in visitors:
        await ws.close(code=4404, reason="visitor_not_found")
        return
    await live.connect(vid, ws)
    await ws.send_json(crowd_message())  # immediate snapshot so the map isn't empty
    try:
        while True:
            await ws.receive_text()  # client may send pings; ignored
    except WebSocketDisconnect:
        live.drop(vid, ws)
