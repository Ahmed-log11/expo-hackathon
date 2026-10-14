/** Western digits in both languages, like the app ("22 د"). */
export const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

/** "14:15" from an API time like "2026-10-15T14:15:00+03:00": the Riyadh clock, whatever the viewer's timezone. */
export const hhmm = (iso: string) => iso.slice(11, 16);

/** "14:15" + 15 -> "14:30". */
export function addMinutes(clock: string, minutes: number): string {
  const [h, m] = clock.split(':').map(Number);
  const total = (h * 60 + m + minutes) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
