"""
Operator briefing for the admin dashboard: the site's numbers -> a short, ranked briefing.

    briefing(focus, language, facts, refresh=False) -> {headline, items, source, ...}

`facts` comes from engine/insights.py. The LLM only writes words around those numbers; it
never sees anything else and is told not to invent figures. Without an API key, or if the call
fails, rules write the same kind of briefing from the same facts, so the dashboard never breaks.

Focus (the dashboard's quick picks):
    overview    how is the site doing
    hotspots    where is it crowded, and is it worse than before
    next_hour   what the forecast says for the next 90 minutes
    actions     what the operator should do now
    balancing   how the routing and reroute offers are doing
"""
from __future__ import annotations

import json
import logging
import os
import threading
import time

log = logging.getLogger("llm.insights")
MODEL = os.getenv("LLM_MODEL", "claude-haiku-5-5")
CACHE_S = 60          # the same briefing is reused for this long...
MIN_REFRESH_S = 15    # ...and "refresh" can't call the model more often than this
MAX_ITEMS = 5
LEVELS = ("critical", "warning", "good", "info")

FOCUSES = {
    "overview": "General status of the whole site right now: the most important things the operator must know.",
    "hotspots": "Where it is crowded, what got busier than before (vs 30 minutes ago and vs normal for this hour), which district is worst.",
    "next_hour": "What the forecast says for the next 30-90 minutes: which pavilions will peak, which will calm down, where there is room.",
    "actions": "Concrete operator actions for right now, each tied to a pavilion and a number: redirect, add staff, open lanes, promote quiet pavilions.",
    "balancing": "How the load balancing works: routed arrivals in the ledger vs capacity, reroute offers sent and accepted, minutes saved, spare capacity.",
}

SYSTEM = (
    "You are the operations analyst for INSYAB, the crowd-balancing system of Expo 2030 Riyadh. "
    "You brief the site operator on a live dashboard. You receive the site's numbers as JSON and a focus. "
    "Write a briefing for that focus: a headline (one sentence, under 14 words) and {lo} to {hi} items, "
    "most important first. Each item: level (critical = act now, warning = watch, good = going well, "
    "info = context), a title under 8 words, a detail under 25 words that cites the exact numbers, "
    "an action under 14 words (or empty when nothing to do), and the pavilion_id it is about (or empty).\n"
    "Rules: use only numbers and pavilions that appear in the JSON, never invent or round differently. "
    "Waits are in minutes. If compare_minutes_ago is null there is no history yet: compare with "
    "normal_wait_min (the model's usual wait for this hour) instead of saying 'than before'. "
    "If compare_estimated is true, the earlier waits are model estimates (the server restarted), "
    "so call that comparison estimated. "
    "Write in {lang_name}, plain and direct, for a busy operator. Name pavilions by their {name_key}."
)

SCHEMA = {
    "type": "object",
    "properties": {
        "headline": {"type": "string"},
        "items": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "level": {"type": "string", "enum": list(LEVELS)},
                    "title": {"type": "string"},
                    "detail": {"type": "string"},
                    "action": {"type": "string"},
                    "pavilion_id": {"type": "string"},
                },
                "required": ["level", "title", "detail", "action", "pavilion_id"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["headline", "items"],
    "additionalProperties": False,
}

_cache: dict[tuple[str, str], tuple[float, dict]] = {}
_lock = threading.Lock()


def briefing(focus: str, language: str, facts: dict, refresh: bool = False) -> dict:
    """Cached per (focus, language); `refresh` asks for a new one (at most every MIN_REFRESH_S)."""
    key, t = (focus, language), time.monotonic()
    with _lock:
        hit = _cache.get(key)
        if hit and (t - hit[0] < MIN_REFRESH_S or (not refresh and t - hit[0] < CACHE_S)):
            return hit[1]
    out = _write(focus, language, facts)
    with _lock:
        _cache[key] = (t, out)
    return out


def _write(focus: str, language: str, facts: dict) -> dict:
    source = "fallback"
    result = None
    if os.getenv("ANTHROPIC_API_KEY"):
        try:
            result = _clean(_llm(focus, language, facts), facts)
            source = "llm"
        except Exception as e:  # any failure -> rules, the dashboard must not break
            log.warning("insights LLM failed, using rules: %s", e)
            result = None
    if not result or not result["items"]:
        result, source = _rules(focus, language, facts), "fallback"
    return {"focus": focus, "language": language, "source": source, "generated_at": facts["as_of"],
            "compare_minutes_ago": facts["compare_minutes_ago"], **result}


# ---------- LLM path ----------
def _llm(focus: str, language: str, facts: dict) -> dict:
    import anthropic  # imported lazily so the API runs without it

    client = anthropic.Anthropic(timeout=20.0, max_retries=1)  # reads ANTHROPIC_API_KEY
    ar = language == "ar"
    msg = client.messages.create(
        model=MODEL,
        max_tokens=2000,
        system=SYSTEM.format(lo=3, hi=MAX_ITEMS, lang_name="Modern Standard Arabic" if ar else "English",
                             name_key="name_ar" if ar else "name_en"),
        # No "effort" here: Render runs LLM_MODEL=claude-haiku-4-5, which rejects it.
        output_config={"format": {"type": "json_schema", "schema": SCHEMA}},
        messages=[{
            "role": "user",
            "content": f"<focus>{focus}: {FOCUSES[focus]}</focus>\n\n<facts>\n"
                       f"{json.dumps(facts, ensure_ascii=False)}\n</facts>",
        }],
    )
    if msg.stop_reason == "refusal":
        raise ValueError("refused")
    text = next((b.text for b in msg.content if b.type == "text"), "")
    return json.loads(text)


def _clean(data: dict, facts: dict) -> dict:
    """Keep well-formed items; drop pavilion IDs that aren't in the facts."""
    known = {p["pavilion_id"] for p in facts.get("busiest", []) + facts.get("rising", [])
             + facts.get("falling", []) + facts.get("above_normal", []) + facts.get("peaking_soon", [])
             + facts.get("quiet", []) + facts.get("ledger_heavy", []) + facts.get("reported_now", [])}
    known |= {d["hottest"]["pavilion_id"] for d in facts.get("districts", [])}
    items = []
    for it in data.get("items", [])[:MAX_ITEMS]:
        if it.get("level") not in LEVELS or not str(it.get("title", "")).strip():
            continue
        pid = str(it.get("pavilion_id", "")).strip()
        items.append({"level": it["level"], "title": str(it["title"]).strip(),
                      "detail": str(it.get("detail", "")).strip(), "action": str(it.get("action", "")).strip(),
                      "pavilion_id": pid if pid in known else ""})
    return {"headline": str(data.get("headline", "")).strip(), "items": items}


# ---------- rules (no API key, or the call failed) ----------
def _rules(focus: str, language: str, f: dict) -> dict:
    ar = language == "ar"

    def tr(a: str, e: str) -> str:
        return a if ar else e

    def nm(r: dict) -> str:
        return r["name_ar"] if ar else r["name_en"]

    def item(level: str, title: str, detail: str, action: str = "", pid: str = "") -> dict:
        return {"level": level, "title": title, "detail": detail, "action": action, "pavilion_id": pid}

    s, ago = f["site"], f["compare_minutes_ago"]
    est_ar, est_en = (" (تقديري)", " (estimated)") if f.get("compare_estimated") else ("", "")
    quiet = f["quiet"][0] if f["quiet"] else None
    redirect = (tr(f"وجّه الزوار إلى {nm(quiet)} (انتظار {quiet['wait_min']} د)",
                   f"Redirect visitors to {nm(quiet)} ({quiet['wait_min']} min)") if quiet else "")

    def site_item() -> dict:
        avg, level = s["avg_wait_min"], ("critical" if s["avg_wait_min"] >= 40 else
                                         "warning" if s["avg_wait_min"] >= 25 else "good")
        trend = ""
        if s["avg_wait_before_min"] is not None:
            d = round(avg - s["avg_wait_before_min"])
            trend = tr(f"، {'+' if d >= 0 else ''}{d} د عن قبل {ago} دقيقة{est_ar}",
                       f", {'+' if d >= 0 else ''}{d} min vs {ago} min ago{est_en}")
        return item(level, tr("الوضع العام", "Site status"),
                    tr(f"متوسط الانتظار {avg} د{trend}. {s['high_count']} أجنحة مزدحمة من {s['pavilions']}.",
                       f"Average wait {avg} min{trend}. {s['high_count']} of {s['pavilions']} pavilions busy."))

    def reported() -> list[dict]:
        return [item("critical", tr(f"بلاغ ازدحام: {nm(r)}", f"Crowd report: {nm(r)}"),
                     tr(f"قياس مباشر: انتظار {r['wait_min']} د.", f"Measured wait: {r['wait_min']} min."),
                     redirect, r["pavilion_id"]) for r in f["reported_now"]]

    def busiest(n: int) -> list[dict]:
        return [item("critical" if r["status"] == "high" else "warning",
                     tr(f"{nm(r)} الأكثر ازدحامًا", f"{nm(r)} is the busiest") if i == 0 else
                     tr(f"{nm(r)} مزدحم", f"{nm(r)} is busy"),
                     tr(f"انتظار {r['wait_min']} د الآن.", f"{r['wait_min']} min wait now."),
                     redirect if r["status"] == "high" else "", r["pavilion_id"])
                for i, r in enumerate(f["busiest"][:n])]

    def rising() -> list[dict]:
        out = [item("warning", tr(f"{nm(r)} يزداد ازدحامًا", f"{nm(r)} is getting busier"),
                    tr(f"من {r['wait_before_min']} إلى {r['wait_min']} د خلال آخر {ago} دقيقة{est_ar}.",
                       f"From {r['wait_before_min']} to {r['wait_min']} min in the last {ago} min{est_en}."),
                    tr("راقبه وجهّز مسارات بديلة", "Watch it and prepare alternatives"), r["pavilion_id"])
               for r in f["rising"][:2]]
        out += [item("warning", tr(f"{nm(r)} أعلى من المعتاد", f"{nm(r)} is above normal"),
                     tr(f"{r['wait_min']} د مقابل {r['normal_wait_min']} د عادةً في هذا الوقت.",
                        f"{r['wait_min']} min vs {r['normal_wait_min']} min usual for this hour."),
                     redirect, r["pavilion_id"])
                for r in f["above_normal"][:2] if r["pavilion_id"] not in {x["pavilion_id"] for x in f["rising"][:2]}]
        return out

    def peaking(n: int) -> list[dict]:
        return [item("warning", tr(f"{nm(r)} يقترب من الذروة", f"{nm(r)} will peak soon"),
                     tr(f"متوقع {r['peak_ahead']['wait_min']} د خلال {r['peak_ahead']['minutes']} دقيقة (الآن {r['wait_min']} د).",
                        f"Expected {r['peak_ahead']['wait_min']} min in {r['peak_ahead']['minutes']} min (now {r['wait_min']})."),
                     tr("جهّز طاقمًا إضافيًا مسبقًا", "Add staff before the peak"), r["pavilion_id"])
                for r in f["peaking_soon"][:n]]

    def calming() -> list[dict]:
        return [item("good", tr(f"{nm(r)} يهدأ", f"{nm(r)} is calming down"),
                     tr(f"من {r['wait_before_min']} إلى {r['wait_min']} د.", f"From {r['wait_before_min']} to {r['wait_min']} min."),
                     "", r["pavilion_id"]) for r in f["falling"][:1]]

    def spare() -> list[dict]:
        if not f["quiet"]:
            return []
        names = "، ".join(f"{nm(r)} ({r['wait_min']} د)" for r in f["quiet"]) if ar else \
            ", ".join(f"{nm(r)} ({r['wait_min']} min)" for r in f["quiet"])
        return [item("good", tr("سعة متاحة", "Spare capacity"),
                     tr(f"أجنحة هادئة: {names}.", f"Quiet pavilions: {names}."),
                     tr("روّج لها في التطبيق", "Promote them in the app"), f["quiet"][0]["pavilion_id"])]

    def district() -> list[dict]:
        if not f["districts"]:
            return []
        d = f["districts"][0]
        return [item("info", tr(f"منطقة {d['name_ar']} الأكثر ازدحامًا", f"{d['name_en']} is the busiest district"),
                     tr(f"متوسط {d['avg_wait_min']} د، وأعلاها {nm(d['hottest'])} ({d['hottest']['wait_min']} د).",
                        f"Average {d['avg_wait_min']} min; highest is {nm(d['hottest'])} ({d['hottest']['wait_min']} min)."),
                     "", d["hottest"]["pavilion_id"])]

    def offers() -> list[dict]:
        o = f["offers"]
        if not o["sent"]:
            return [item("info", tr("إعادة التوجيه", "Reroute offers"),
                         tr("لم تُرسل عروض بعد. التوفير الحالي من الخطط الأولى: "
                            f"{f['saved_min_total']:,} دقيقة.",
                            f"No offers sent yet. Savings so far come from the plans: {f['saved_min_total']:,} min."))]
        return [item("good", tr("إعادة التوجيه تعمل", "Reroutes are working"),
                     tr(f"أُرسل {o['sent']} عرضًا، قُبل {o['accepted']} ({o['acceptance_pct']}%)، "
                        f"ووفّرت {o['accepted_saved_min']} دقيقة.",
                        f"{o['sent']} offers sent, {o['accepted']} accepted ({o['acceptance_pct']}%), "
                        f"{o['accepted_saved_min']} min saved."))]

    def ledger() -> list[dict]:
        return [item("warning" if r["routed_load_pct"] >= 80 else "info",
                     tr(f"حجوزات {nm(r)}", f"Bookings at {nm(r)}"),
                     tr(f"{r['routed_next_2h']:,} زائر موجّه خلال ساعتين ({r['routed_load_pct']}% من السعة).",
                        f"{r['routed_next_2h']:,} routed arrivals in 2 h ({r['routed_load_pct']}% of capacity)."),
                     tr("قلّل التوجيه إليه", "Route fewer visitors there") if r["routed_load_pct"] >= 80 else "",
                     r["pavilion_id"]) for r in f["ledger_heavy"][:2]]

    def forecast_site() -> dict:
        d = round(s["avg_wait_in_60_min"] - s["avg_wait_min"])
        return item("warning" if d >= 5 else "good" if d <= -5 else "info",
                    tr("خلال ساعة", "In one hour"),
                    tr(f"متوسط الانتظار المتوقع {s['avg_wait_in_60_min']} د (الآن {s['avg_wait_min']} د).",
                       f"Expected average wait {s['avg_wait_in_60_min']} min (now {s['avg_wait_min']})."))

    if focus == "hotspots":
        items = reported() + busiest(2) + rising() + district()
    elif focus == "next_hour":
        items = [forecast_site()] + peaking(3) + calming() + spare()
    elif focus == "actions":
        items = reported() + [i for i in busiest(2) if i["action"]] + peaking(2) + spare() + \
                [i for i in ledger() if i["action"]]
    elif focus == "balancing":
        items = offers() + ledger() + spare() + [item("good", tr("الدقائق الموفّرة", "Minutes saved"),
                                                         tr(f"وفّر النظام {f['saved_min_total']:,} دقيقة انتظار للزوار.",
                                                            f"The system saved visitors {f['saved_min_total']:,} min of waiting."))]
    else:
        items = [site_item()] + reported() + busiest(1) + rising() + peaking(2) + spare() + offers()

    seen: set[str] = set()   # one point per pavilion: the first (most important) one wins
    items = [i for i in items if not i["pavilion_id"] or not (i["pavilion_id"] in seen or seen.add(i["pavilion_id"]))]
    items = items[:MAX_ITEMS]
    top = f["busiest"][0] if f["busiest"] else None
    if focus == "next_hour":
        headline = tr(f"خلال ساعة: متوسط الانتظار {s['avg_wait_in_60_min']} د",
                      f"Next hour: average wait {s['avg_wait_in_60_min']} min")
    elif focus == "balancing":
        headline = tr(f"وفّر النظام {f['saved_min_total']:,} دقيقة انتظار",
                      f"{f['saved_min_total']:,} minutes of waiting saved")
    elif top:
        headline = tr(f"متوسط الانتظار {s['avg_wait_min']} د، والأعلى {nm(top)} ({top['wait_min']} د)",
                      f"Average wait {s['avg_wait_min']} min; {nm(top)} highest at {top['wait_min']} min")
    else:
        headline = tr("لا بيانات بعد", "No data yet")
    return {"headline": headline, "items": items}
