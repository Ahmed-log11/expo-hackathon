# llm/ — language layer

The LLM never decides routes. It only handles language, at these points:
1. Interests (free text) -> structured wishlist (JSON output)
2. Feasibility explanation
3. Plan summary (streamed in after the route is shown)
4. Reroute reasons (template first, nicer wording optional)
5. Plan adjustments via tool calling, e.g.:
   add_stop, remove_stop, set_end_time, add_constraint (indoor / nearby / accessible),
   add_break, get_waits

Rules:
- Call the LLM API directly with structured output / tool calling. No framework needed.
- Never block a reroute waiting on the LLM.
- Arabic + English.
- API key comes from .env, never hard-coded.
