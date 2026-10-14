"""
Run the API locally with its clock moved to another time of day (Riyadh time).

The engine treats the Expo as open 10:00-24:00, so at night POST /visitors refuses every plan
(outside_opening_hours) and the dashboard's "simulate visitors" can't be tried. This starts the
same app with the clock shifted (the clock keeps running from there). Nothing in api/ or engine/
changes: api.main.now() is the only place that reads the clock.

    python tools/api_at_time.py                # 14:00, port 8000
    python tools/api_at_time.py 18:30 8001
    then open the dashboard with ?api=http://localhost:8000
"""
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import api.main as m  # noqa: E402
import uvicorn  # noqa: E402

clock = sys.argv[1] if len(sys.argv) > 1 else "14:00"
port = int(sys.argv[2]) if len(sys.argv) > 2 else 8000
hh, mm = (int(x) for x in clock.split(":"))
start = datetime.now(m.RIYADH)
offset = start.replace(hour=hh, minute=mm, second=0, microsecond=0) - start
m.now = lambda: (datetime.now(m.RIYADH) + offset).replace(microsecond=0)
print(f"API on http://localhost:{port}, server clock {m.now():%H:%M} Riyadh", flush=True)
uvicorn.run(m.app, host="0.0.0.0", port=port)
