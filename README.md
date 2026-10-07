# Expo 2030 Hackathon: Crowd-Balancing Navigation

At previous World Expos, visitors spent hours waiting in queues because everyone headed to the same pavilions at the same time. Our idea is an AI system that balances crowds by giving each visitor a personal route based on their own interests. Instead of telling everyone where it's quiet, the system coordinates all routes together, so no pavilion gets overloaded and queues stay short across the whole site. Visitors follow their route on a live map that shows where to go next, how long the walk is, and the expected wait.

**Challenge:** Track 1 (Smart Visitor Experience), challenge 1.1, with 1.6 built in.
**Event:** 15–17 October 2026, Tuwaiq Academy, Riyadh.

## Project structure

| Folder | What lives here | Owner |
| --- | --- | --- |
| `app/` | Mobile frontend: interests, plan, map, next-stop card, reroute alert | Frontend |
| `api/` | FastAPI: REST endpoints + WebSocket, the only thing the app talks to | Backend |
| `engine/` | Crowd state, routing engine, load ledger (the balancing) | Backend |
| `ml/` | Wait-time prediction: training scripts + saved model | Data / ML |
| `llm/` | LLM client, tool definitions, prompts | AI |
| `sim/` | Simulator + site data (pavilions, paths) | Data / ML |
| `contract/` | The data contract between app and API | Everyone |

## How the parts connect

```
sim/ (fake visitors, scans, locations)
        ↓
engine/ crowd state  →  ml/ wait prediction  →  engine/ routing + load ledger
                                                        ↕
                                                  llm/ (language only)
                                                        ↓
                                    api/ REST + WebSocket  →  app/
```

- The app only displays. The backend does all the thinking.
- The LLM never makes routing decisions; it parses requests and explains results.
- In the demo, `sim/` plays the real world. Real Expo data would plug in at the same point.

## Working rules

1. **The contract is the source of truth.** Read `contract/README.md` before building. Any change gets announced in the team chat and updated there.
2. **Branches:** work on your own branch (`front`, `back`, `sim`, `ai`). Merge into `main` only when it runs. `main` must always work.
3. **No secrets in git.** Copy `.env.example` to `.env` and put the LLM key there. `.env` is ignored.
4. **Connect early.** First real front ↔ back connection with one endpoint (`GET /pavilions`) as soon as possible, not at the end.

## Key dates

| Date | Milestone |
| --- | --- |
| 8 Oct | Team registration deadline |
| ~7 Oct | Checkpoint: balanced routing beats the baseline in simulation |
| 15 Oct | Hackathon starts |
| 16–17 Oct | Submission + 5-minute pitch |
| 17 Oct | Closing ceremony |

## Running it

_To be filled in as each part comes together._
