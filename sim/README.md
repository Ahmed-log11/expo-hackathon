# sim/ — simulator and site data

Plays the role of the real world in the demo, and produces the before/after numbers.

Site data (to create):
- pavilions.json: ~25 pavilions across 5 districts
  (id, name, district, position, capacity per hour, avg visit time, popularity, indoor)
- paths.json: walking minutes between pavilions + which paths are shaded

Simulation:
- Minute-by-minute: visitors arrive with 4–8 wishlist pavilions, walk, queue, visit.
- Peaks: weekends, evenings, final-weeks surge.
- Sends scans and location pings into the backend exactly like real data would.

Experiments:
1. Baseline: visitors choose next stop themselves (nearest / most popular)
2. Balanced: visitors follow our routes
3. Partial adoption: e.g. only 30% follow our routes
Metrics: average wait, worst wait, % of wishlist completed.

Checkpoint (~7 Oct): balanced clearly beats baseline.
