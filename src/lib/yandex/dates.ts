export function day(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("INVALID_DATE");
  const d = new Date(value + "T00:00:00Z");
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== value)
    throw new Error("INVALID_DATE");
  return d;
}
export function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}
export function shift(value: string, n: number): string {
  const d = day(value);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
}
export function yesterday(
  now = new Date(),
  timeZone = "Europe/Moscow",
): string {
  return shift(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now),
    -1,
  );
}
export function days(from: string, to: string, limit=90): string[] {
  const list: string[] = [];
  day(from);
  day(to);
  for (let v = from; v <= to; v = shift(v, 1)) {
    list.push(v);
    if (list.length > Math.min(600,limit)) throw new Error("PERIOD_LIMIT");
  }
  return list;
}
export function period(n = 30, now = new Date()) {
  const to = yesterday(now);
  return { from: shift(to, 1 - n), to };
}
export function nextMoscowDay(now = new Date()): Date {
  const current = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return new Date(shift(current, 1) + "T00:05:00+03:00");
}
