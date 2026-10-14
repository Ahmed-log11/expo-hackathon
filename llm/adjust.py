"""
C7: "adjust my plan". A visitor's request in Arabic or English -> structured changes.

    understand(text, language, plan_ids, pavilions, now) -> {"changes": [...], "source": "llm"|"fallback"}
    describe(changes, old_ids, new_ids, saved_min, names, language) -> reply text

A change is one of:
    {"action": "remove",   "pavilion_id": "jp"}        skip a planned pavilion
    {"action": "add",      "pavilion_id": "kr"}        add a named pavilion
    {"action": "suggest",  "kind": "indoor"|"nearby"|"quiet"}   add the best pavilion of that kind
    {"action": "end_time", "time": "21:00"}            leave at a different time

The LLM only understands the request. The engine decides the new route, and the reply is
written from what actually changed (describe), so it can never promise something the
engine didn't do. Without an API key, or if the call fails, a keyword parser runs instead.
"""
from __future__ import annotations

import logging
import os
import re
from datetime import datetime

log = logging.getLogger("llm.adjust")
MODEL = os.getenv("LLM_MODEL", "claude-haiku-5-5")
KINDS = ("indoor", "nearby", "quiet")

SYSTEM = (
    "You turn an Expo 2030 Riyadh visitor's request about their day plan into changes. "
    "You get their planned pavilions, the pavilion list, the current time and their message "
    "(Arabic, Gulf Arabic or English). Call submit_changes once.\n"
    "- remove: they want to skip a pavilion (only ones in their plan)\n"
    "- add: they name a pavilion they want to visit\n"
    "- suggest: they want something without naming it. kind=indoor if tired, hot, want to rest "
    "or want something air-conditioned; kind=nearby if they want something close; kind=quiet "
    "if they want to avoid crowds or queues\n"
    "- end_time: they want to leave at a different time; 24h HH:MM, the Expo is open 10:00-24:00, "
    "so '9' or '9 pm' means 21:00\n"
    "Use only pavilion IDs from the list. If the message asks for nothing you can do, return no changes."
)

TOOL = {
    "name": "submit_changes",
    "description": "Return the plan changes the visitor asked for.",
    "input_schema": {
        "type": "object",
        "properties": {
            "changes": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "action": {"type": "string", "enum": ["remove", "add", "suggest", "end_time"]},
                        "pavilion_id": {"type": "string"},
                        "kind": {"type": "string", "enum": list(KINDS)},
                        "time": {"type": "string", "description": "HH:MM, 24h"},
                    },
                    "required": ["action"],
                },
            }
        },
        "required": ["changes"],
    },
}


# ---------- validation (both paths) ----------
def _clean(changes: list[dict], plan_ids: list[str], pavilions: dict) -> list[dict]:
    valid = {pid.lower(): pid for pid in pavilions}
    out, seen = [], set()
    for c in changes:
        a = c.get("action")
        if a in ("remove", "add"):
            pid = valid.get(str(c.get("pavilion_id", "")).strip().lower())
            if not pid or (a == "remove" and pid not in plan_ids) or (a == "add" and pid in plan_ids):
                continue
            item = {"action": a, "pavilion_id": pid}
        elif a == "suggest":
            item = {"action": a, "kind": c.get("kind") if c.get("kind") in KINDS else "indoor"}
        elif a == "end_time":
            m = re.fullmatch(r"(\d{1,2}):(\d{2})", str(c.get("time", "")).strip())
            if not m or not (0 <= int(m[1]) <= 24 and 0 <= int(m[2]) < 60):
                continue
            item = {"action": a, "time": f"{int(m[1]):02d}:{m[2]}"}
        else:
            continue
        key = tuple(sorted(item.items()))
        if key not in seen:
            seen.add(key)
            out.append(item)
    return out


# ---------- LLM ----------
def _llm(text: str, language: str, plan_ids: list[str], pavilions: dict, now: datetime) -> list[dict]:
    import anthropic

    client = anthropic.Anthropic(timeout=15.0, max_retries=1)
    catalog = "\n".join(
        f'{pid} | {p.get("name_en", "")} / {p.get("name_ar", "")} | {"indoor" if p.get("indoor") else "outdoor"}'
        for pid, p in pavilions.items())
    msg = client.messages.create(
        model=MODEL, max_tokens=500, system=SYSTEM, tools=[TOOL],
        tool_choice={"type": "tool", "name": "submit_changes"},
        messages=[{"role": "user", "content":
                   f"<now>{now.strftime('%H:%M')}</now>\n<plan>{', '.join(plan_ids)}</plan>\n"
                   f"<pavilions>\n{catalog}\n</pavilions>\n<message>\n{text}\n</message>"}],
    )
    for block in msg.content:
        if block.type == "tool_use":
            return block.input.get("changes", [])
    raise ValueError("no tool_use block")


# ---------- keyword fallback ----------
_NEG = r"(skip|remove|cancel|drop|without|no more|not|don'?t|شيل|الغ|ألغ|احذف|بدون|ما ابي|ما أبي|ما ابغى|ما أبغى|لا ابي|لا أبي|مو|بلاش|خلاص من)"
_ADD = r"(add|include|also|visit|see|go to|want|أضف|اضف|ضيف|زيد|ابي|أبي|ابغى|أبغى|ودي|أزور|ازور|نروح|اروح|أروح)"
_INDOOR = r"(tired|rest|sit|hot|heat|indoor|inside|air.?con|ac\b|exhausted|تعبان|تعبت|مرهق|ارتاح|أرتاح|حر|حار|داخلي|مكيف|مكيّف|جلسة)"
_NEAR = r"(close|near|nearby|short walk|قريب|جنبي|قريبة)"
_QUIET = r"(quiet|crowd|queue|line|busy|wait|هادي|هادئ|زحمة|زحام|طابور|انتظار|مزدحم)"
_LEAVE = r"(leave|go home|until|till|by|end|finish|أطلع|اطلع|أمشي|امشي|أروح البيت|حتى|لين|لحد|الساعة|ساعة)"


# Short names people actually say, beyond the official ones in pavilions.json.
ALIASES = {
    "kr": ["korea", "كوريا"], "us": ["usa", "america", "american", "امريكا", "أمريكا", "الامريكي", "الأمريكي"],
    "gb": ["uk", "britain", "british", "england", "بريطانيا", "البريطاني"],
    "ae": ["uae", "emirates", "الامارات", "الإمارات", "الاماراتي", "الإماراتي"],
    "ksa": ["saudi", "السعودية", "السعودي"], "jp": ["japanese", "ياباني"], "cn": ["chinese", "صيني"],
    "it": ["italian", "ايطاليا", "إيطاليا"], "fr": ["french", "فرنسي"], "de": ["german", "الماني", "ألماني"],
    "in": ["indian", "هندي"], "eg": ["egyptian", "مصري"],
}


def _names(pavilions: dict) -> list[tuple[str, str]]:
    out = []
    for pid, p in pavilions.items():
        en = p.get("name_en", "").lower().replace(" pavilion", "").strip()
        ar = p.get("name_ar", "").replace("جناح", "").strip()
        out += [(pid, n) for n in (en, ar, *ALIASES.get(pid, [])) if len(n) >= 2]
    return sorted(out, key=lambda x: -len(x[1]))      # longest first: "south korea" before "korea"


def _find(name: str, t: str):
    """Whole-word match; Arabic may carry a one-letter prefix (و ب ف ل ك: "واليابان", "بمصر")."""
    return re.search(r"(?<![a-z\u0600-\u06FF])(?:[وبفلك])?" + re.escape(name.lower()) + r"(?![a-z])", t)


def named_pavilions(text: str, pavilions: dict) -> list[str]:
    """Pavilions the visitor names outright ("I love Japan", "أبي مصر"), in the order they appear.
    Thematic pavilions are left out: their names are topics ("culture"), not choices."""
    t, found = text.lower(), {}
    for pid, name in _names(pavilions):
        if pid in found or str(pavilions[pid].get("type")) == "thematic":
            continue
        m = _find(name, t)
        if m:
            found[pid] = m.start()
    return sorted(found, key=found.get)


def _fallback(text: str, plan_ids: list[str], pavilions: dict) -> list[dict]:
    t = text.lower()
    changes, found = [], set()
    for pid, name in _names(pavilions):
        if pid in found:
            continue
        m = _find(name, t)
        if not m:
            continue
        found.add(pid)
        i = m.start()
        before = t[max(0, i - 25):i]
        if pid in plan_ids and re.search(_NEG, before):
            changes.append({"action": "remove", "pavilion_id": pid})
        elif pid not in plan_ids and (re.search(_ADD, before) or not re.search(_NEG, before)):
            changes.append({"action": "add", "pavilion_id": pid})
    m = re.search(_LEAVE + r"\D{0,12}(\d{1,2})(?::(\d{2}))?\s*(pm|am|م|ص|مساء|مساءً|الليل)?", t)
    if m:
        h, mins, ampm = int(m.group(2)), m.group(3) or "00", m.group(4) or ""
        if ampm in ("am", "ص") and h == 12:
            h = 0
        elif h < 10 or ampm in ("pm", "م", "مساء", "مساءً", "الليل"):
            h = h + 12 if h < 12 else h                      # the Expo opens at 10, so "9" is 21:00
        if 10 <= h <= 24:
            changes.append({"action": "end_time", "time": f"{h:02d}:{mins}"})
    if not any(c["action"] == "add" for c in changes):
        if re.search(_INDOOR, t):
            changes.append({"action": "suggest", "kind": "indoor"})
        elif re.search(_QUIET, t):
            changes.append({"action": "suggest", "kind": "quiet"})
        elif re.search(_NEAR, t):
            changes.append({"action": "suggest", "kind": "nearby"})
    return changes


def understand(text: str, language: str, plan_ids: list[str], pavilions: dict, now: datetime) -> dict:
    if os.getenv("ANTHROPIC_API_KEY"):
        try:
            return {"changes": _clean(_llm(text, language, plan_ids, pavilions, now), plan_ids, pavilions),
                    "source": "llm"}
        except Exception as e:  # never break the request
            log.warning("LLM adjust failed, using fallback: %s", e)
    return {"changes": _clean(_fallback(text, plan_ids, pavilions), plan_ids, pavilions), "source": "fallback"}


# ---------- reply, written from what actually changed ----------
def describe(changes: list[dict], old_ids: list[str], new_ids: list[str], saved_min: int,
             names: dict, language: str) -> str:
    ar = language == "ar"
    n = lambda pid: names.get(pid, pid)  # noqa: E731
    parts = []
    if not changes:
        return ("لم أفهم تعديلًا محددًا. جرّب مثلًا: «تخطَّ جناح اليابان»، «أضف كوريا»، «أنا تعبان»، «أبي أطلع الساعة 9»."
                if ar else
                "I couldn't find a change to make. Try: \"skip Japan\", \"add Korea\", \"I'm tired\", \"leave at 9\".")
    removed = [p for p in old_ids if p not in new_ids]
    added = [p for p in new_ids if p not in old_ids]
    asked_add = {c.get("pavilion_id") for c in changes if c["action"] in ("add", "suggest")}
    for c in changes:
        if c["action"] == "end_time":
            parts.append(f"عدّلنا وقت المغادرة إلى {c['time']}" if ar else f"Leaving at {c['time']} now")
    if added:
        parts.append(("أضفنا " + "، ".join(n(p) for p in added)) if ar
                     else ("Added " + ", ".join(n(p) for p in added)))
    if removed:
        parts.append(("حذفنا " + "، ".join(n(p) for p in removed)) if ar
                     else "Removed " + ", ".join(n(p) for p in removed))
    missing = [p for p in asked_add if p and p not in new_ids]
    if missing:
        parts.append(("لم يتسع الوقت لـ" + "، ".join(n(p) for p in missing)) if ar
                     else "No time left for " + ", ".join(n(p) for p in missing))
    if not added and not removed and not any(c["action"] == "end_time" for c in changes):
        parts.append("الخطة كما هي" if ar else "Your plan stays the same")
    text = ("، و".join(parts) if ar else "; ".join(parts)) + "."
    if saved_min >= 5:
        text += f" ستنتظر أقل بحوالي {saved_min} دقيقة." if ar else f" About {saved_min} min less waiting."
    return text[0].upper() + text[1:] if not ar else text
