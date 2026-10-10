"""
C5 test client: the reroute-offer flow end to end.

Creates a visitor, opens /live/{id}, spikes the queue at their next stop with
/debug/observe, waits for the reroute_offer, accepts it, and prints the new route.

    python tools/ws_client.py                          # local
    python tools/ws_client.py https://your-api.onrender.com
"""
import asyncio, json, sys, urllib.request
import websockets

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000").rstrip("/")
WS = BASE.replace("https://", "wss://").replace("http://", "ws://")


def call(path, body=None):
    req = urllib.request.Request(BASE + path, data=json.dumps(body or {}).encode(),
                                 headers={"Content-Type": "application/json"},
                                 method="POST" if body is not None else "GET")
    return json.load(urllib.request.urlopen(req))


async def main():
    v = call("/visitors", {"interests": "I love tech and Japanese culture", "language": "en"})
    vid = v["visitor_id"]
    stops = [s["pavilion_id"] for s in v["route"]["stops"]]
    print("visitor", vid, "route", stops)
    nxt = stops[0]
    async with websockets.connect(f"{WS}/live/{vid}") as ws:
        async def spike():
            await asyncio.sleep(2)
            print(f"-> spiking {nxt} to 90 min:", call("/debug/observe", {"pavilion_id": nxt, "wait_min": 90}))
        asyncio.create_task(spike())
        while True:
            msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=30))
            if msg["type"] == "crowd_update":
                print("crowd_update:", len(msg["pavilions"]), "pavilions")
            elif msg["type"] == "crowd_alert":
                print(f"crowd_alert: {msg['pavilion_id']} now {msg['wait_min']} min (planned {msg['planned_wait_min']})")
            elif msg["type"] == "reroute_offer":
                print("offer:", msg["reason"])
                print("   old:", [(s["pavilion_id"], s["wait_min"]) for s in msg["old"]])
                print("   new:", [(s["pavilion_id"], s["wait_min"]) for s in msg["new"]], f"saves {msg['saves_min']} min")
                r = call(f"/visitors/{vid}/offers/{msg['offer_id']}/accept", {})
                print("accepted -> route v%d" % r["version"], [s["pavilion_id"] for s in r["stops"]])
                break

asyncio.run(main())
