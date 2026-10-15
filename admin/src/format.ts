/** Western digits, like the app ("22 د"). */
export const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

/** "14:15" from an API time like "2026-10-15T14:15:00+03:00": the Riyadh clock, whatever the viewer's timezone. */
export const hhmm = (iso: string) => iso.slice(11, 16);

export const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
