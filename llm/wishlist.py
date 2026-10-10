"""
C4: free-text interests (Arabic or English) -> list of pavilion IDs.

The LLM only picks from the given pavilion list; it never orders or routes.
Structured output is enforced with a forced tool call, then every ID is validated
against the real list. If there is no API key or the call fails, a keyword matcher
runs instead, so the demo never breaks.

    extract_wishlist(text, language, pavilions) -> {"items": [...], "source": "llm"|"fallback"}
"""
from __future__ import annotations

import json
import logging
import os
import re

log = logging.getLogger("llm.wishlist")

MIN_ITEMS, MAX_ITEMS = 4, 8
MODEL = os.getenv("LLM_MODEL", "claude-haiku-5-5")

SYSTEM = (
    "You match Expo 2030 Riyadh visitors to pavilions. You receive a list of pavilions "
    "and the visitor's interests in Arabic or English. Pick {lo} to {hi} pavilions that best "
    "match, most relevant first. Only use IDs from the list. If the interests are vague, add "
    "popular pavilions. Write each reason in {lang_name}, under 12 words, addressed to the visitor."
)

TOOL = {
    "name": "submit_wishlist",
    "description": "Return the matched pavilions.",
    "input_schema": {
        "type": "object",
        "properties": {
            "items": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "pavilion_id": {"type": "string"},
                        "reason": {"type": "string"},
                    },
                    "required": ["pavilion_id", "reason"],
                },
            }
        },
        "required": ["items"],
    },
}


def _catalog(pavilions: list[dict]) -> str:
    return "\n".join(
        f'{p["id"]} | {p["name_en"]} / {p.get("name_ar", "")} | {p["district"]} | '
        f'{", ".join(p.get("tags", []))} | {"indoor" if p.get("indoor") else "outdoor"}'
        for p in pavilions
    )


def _clean(items: list[dict], pavilions: list[dict], language: str) -> list[dict]:
    """Keep valid unique IDs; top up with popular pavilions if too few."""
    valid = {p["id"].lower(): p["id"] for p in pavilions}   # match case-insensitively, return real ID
    out, seen = [], set()
    for it in items:
        pid = valid.get(str(it.get("pavilion_id", "")).strip().lower(), "")
        if pid and pid not in seen:
            seen.add(pid)
            out.append({"pavilion_id": pid, "reason": str(it.get("reason", "")).strip()})
    if len(out) < MIN_ITEMS:
        filler = "من الأجنحة الأكثر شعبية" if language == "ar" else "One of the most popular pavilions"
        for p in sorted(pavilions, key=lambda p: -p.get("popularity", 0)):
            if len(out) >= MIN_ITEMS:
                break
            if p["id"] not in seen:
                seen.add(p["id"])
                out.append({"pavilion_id": p["id"], "reason": filler})
    return out[:MAX_ITEMS]


# ---------- LLM path ----------
def _llm(text: str, language: str, pavilions: list[dict]) -> list[dict]:
    import anthropic  # imported lazily so the API runs without it

    client = anthropic.Anthropic(timeout=15.0, max_retries=1)  # reads ANTHROPIC_API_KEY
    msg = client.messages.create(
        model=MODEL,
        max_tokens=800,
        system=SYSTEM.format(lo=MIN_ITEMS, hi=MAX_ITEMS,
                             lang_name="Arabic" if language == "ar" else "English"),
        tools=[TOOL],
        tool_choice={"type": "tool", "name": "submit_wishlist"},
        messages=[{
            "role": "user",
            "content": f"<pavilions>\n{_catalog(pavilions)}\n</pavilions>\n\n<interests>\n{text}\n</interests>",
        }],
    )
    for block in msg.content:
        if block.type == "tool_use":
            return block.input.get("items", [])
    raise ValueError("no tool_use block in response")


# ---------- offline fallback ----------
# The site's tags are coarse (technology, culture, planet, humanity, collaboration),
# so the fallback maps everyday words onto them. The LLM path doesn't need this.
_SYN = {
    "technology": "tech technology ai robot robots robotics science innovation space future digital engineering cars gadgets",
    "culture": "culture art arts history archaeology heritage food music fashion design architecture traditional museum crafts",
    "planet": "planet nature environment climate sustainability green ocean water energy wildlife garden gardens",
    "humanity": "humanity people health education society community wellbeing family kids",
    "collaboration": "collaboration cooperation peace global partnership trade business",
}
_WORD_TAG = {w: tag for tag, words in _SYN.items() for w in words.split()}

_AR = {  # Arabic keyword -> English word (then mapped through _WORD_TAG)
    "تقنية": "technology", "تكنولوجيا": "technology", "روبوت": "robotics", "فضاء": "space",
    "تاريخ": "history", "آثار": "archaeology", "تراث": "heritage", "ثقافة": "culture",
    "طبيعة": "nature", "بيئة": "sustainability", "استدامة": "sustainability", "طاقة": "energy",
    "فن": "art", "فنون": "art", "موسيقى": "music", "أكل": "food", "طعام": "food",
    "ياباني": "japanese", "يابانية": "japanese", "كرة": "football", "سيارات": "cars", "تعليم": "education",
    "ذكاء": "ai", "ألعاب": "games", "محيط": "ocean", "بحر": "ocean", "مدن": "future cities",
}


def _match(word: str, term: str) -> bool:
    """'tech' ~ 'technology', 'robots' ~ 'robotics'; short words must match exactly."""
    if len(term) < 3:
        return False
    return word == term or (len(term) >= 4 and (word.startswith(term) or term.startswith(word[:5])))


_TAG_AR = {"technology": "التقنية", "culture": "الثقافة", "planet": "الكوكب",
           "humanity": "الإنسانية", "collaboration": "التعاون"}


def _fallback(text: str, language: str, pavilions: list[dict]) -> list[dict]:
    t = text.lower()
    words = set(re.findall(r"[a-z\-]+", t))
    words |= {w for en in (en for ar, en in _AR.items() if ar in text) for w in en.split()}
    terms = words | {_WORD_TAG[w] for w in words if w in _WORD_TAG}
    scored = []
    for p in pavilions:
        hits = [tag for tag in p.get("tags", []) if any(_match(w, term) for w in tag.split() for term in terms)]
        # "Japan Pavilion" -> "japan": matches "japan", "japanese"
        name = p["name_en"].lower().replace(" pavilion", "").strip()
        country_ar = p.get("name_ar", "").replace("جناح", "").strip()
        named = p.get("type") != "thematic" and (   # thematic names = district names; tags cover them
            name in t or any(w.startswith(name) for w in words)
            or (len(country_ar) > 2 and country_ar in text))
        if named:
            hits = ["__named__"] * 3 + hits      # an explicitly named pavilion outranks tag matches
        if hits:
            scored.append((len(hits), p.get("popularity", 0), p, hits))
    scored.sort(key=lambda s: (-s[0], -s[1]))
    items = []
    for _, _, p, hits in scored:
        if hits[0] == "__named__":
            reason = "طلبته بالاسم" if language == "ar" else "You asked for it by name"
        elif language == "ar":
            reason = f"يناسب اهتمامك بـ{_TAG_AR.get(hits[0], hits[0])}"
        else:
            reason = f"Matches your interest in {hits[0]}"
        items.append({"pavilion_id": p["id"], "reason": reason})
    return items


def extract_wishlist(text: str, language: str, pavilions: list[dict]) -> dict:
    language = "ar" if language == "ar" else "en"
    if os.getenv("ANTHROPIC_API_KEY"):
        try:
            return {"items": _clean(_llm(text, language, pavilions), pavilions, language), "source": "llm"}
        except Exception as e:  # network, auth, bad output: never break the request
            log.warning("LLM wishlist failed, using fallback: %s", e)
    return {"items": _clean(_fallback(text, language, pavilions), pavilions, language), "source": "fallback"}


if __name__ == "__main__":
    import sys
    from pathlib import Path

    site = json.loads((Path(__file__).resolve().parent.parent / "sim" / "pavilions.json").read_text("utf-8"))
    queued = [p for p in site["places"] if p.get("has_queue")]
    q = " ".join(sys.argv[1:]) or "I love tech and Japanese culture"
    lang = "ar" if re.search(r"[\u0600-\u06FF]", q) else "en"
    print(json.dumps(extract_wishlist(q, lang, queued), ensure_ascii=False, indent=2))
