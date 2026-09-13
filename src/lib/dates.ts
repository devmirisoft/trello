// Date helpers. All of this runs in the browser, so `new Date(y, m, d, h)`
// is built from LOCAL calendar fields and `.toISOString()` converts it to
// the correct UTC instant for Trello's `due` field — no manual timezone math.

export type DateChoice = "today" | "tomorrow" | "custom";

const DEFAULT_DUE_HOUR = 18; // 6pm local on the chosen day, if no time is picked

export function todayLocalISODate(): string {
  return toLocalISODate(new Date());
}

export function tomorrowLocalISODate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return toLocalISODate(d);
}

// yyyy-mm-dd in the browser's local timezone (NOT toISOString, which is UTC).
export function toLocalISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Turn a yyyy-mm-dd string into the UTC instant Trello expects for `due`,
// defaulting to 6pm local time on that date.
export function dueDateForTrello(
  localISODate: string,
  hour: number = DEFAULT_DUE_HOUR
): string {
  const [y, m, d] = localISODate.split("-").map(Number);
  const dt = new Date(y, m - 1, d, hour, 0, 0, 0);
  return dt.toISOString();
}

export function formatFriendly(localISODate: string): string {
  const [y, m, d] = localISODate.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// yyyy-mm-dd -> a Date at local midnight, the inverse of toLocalISODate.
// `new Date("2026-09-12")` would parse as UTC and can land on the day before.
export function fromLocalISODate(localISODate: string): Date {
  const [y, m, d] = localISODate.split("-").map(Number);
  return new Date(y, m - 1, d);
}
