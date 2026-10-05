/**
 * S10 · NH8 production — the rules, with no database (Brief §30). The HOD's
 * screen answers two questions: which PIOs are on my 45-day clock and how
 * far along, and on which of the next 14 days will more arrive than my
 * people can take.
 */

export const FORECAST_DAYS = 14;

export type Assignment = {
  id: string;
  pioNumber: string;
  project: string | null;
  station: string;
  scope: string | null;
  status: string | null;
  /** YYYY-MM-DD */
  target: string;
  done: boolean;
};

export type ForecastRow = {
  /** YYYY-MM-DD */
  date: string;
  arriving: number;
  manpower: number | null;
};

export type AssignmentState = "Overdue" | "In production" | "Queued" | "Complete";

export type ForecastDay = {
  /** 1 = today */
  n: number;
  date: string;
  arriving: number;
  /** null when no station in view has a manpower figure for the day */
  capacity: number | null;
  /** false when nothing was forecast for the day at all */
  forecast: boolean;
  breach: boolean;
};

export function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function daysLeft(target: string, today: string): number {
  const ms = (s: string) => {
    const [y, m, d] = s.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((ms(target) - ms(today)) / 86_400_000);
}

export function assignmentState(a: Assignment, today: string): AssignmentState {
  if (a.done) return "Complete";
  if (daysLeft(a.target, today) < 0) return "Overdue";
  if (a.status === "queued") return "Queued";
  return "In production";
}

/** Overdue first, then the nearest deadline. */
export function sortQueue(rows: Assignment[], today: string): Assignment[] {
  return rows
    .filter((a) => !a.done)
    .sort((a, b) => daysLeft(a.target, today) - daysLeft(b.target, today) || a.pioNumber.localeCompare(b.pioNumber));
}

/**
 * The next 14 days, today first. Rows from several stations on one date are
 * added together. A day is a breach only when there is a manpower figure and
 * more PIOs arrive than it covers — a day nobody forecast is shown as such,
 * never as a quiet green.
 */
export function forecastDays(rows: ForecastRow[], today: string, n = FORECAST_DAYS): ForecastDay[] {
  return Array.from({ length: n }, (_, i) => {
    const date = addDays(today, i);
    const day = rows.filter((r) => r.date === date);
    const arriving = day.reduce((s, r) => s + r.arriving, 0);
    const known = day.filter((r) => r.manpower !== null);
    const capacity = known.length ? known.reduce((s, r) => s + (r.manpower ?? 0), 0) : null;
    return {
      n: i + 1,
      date,
      arriving,
      capacity,
      forecast: day.length > 0,
      breach: capacity !== null && arriving > capacity,
    };
  });
}

/** Breach days grouped into runs: [4,5,9] → "Days 4–5", "Day 9". */
export function breachRuns(days: ForecastDay[]): string[] {
  const hit = days.filter((d) => d.breach).map((d) => d.n);
  const runs: string[] = [];
  for (let i = 0; i < hit.length; ) {
    let j = i;
    while (j + 1 < hit.length && hit[j + 1] === hit[j] + 1) j++;
    runs.push(i === j ? `Day ${hit[i]}` : `Days ${hit[i]}–${hit[j]}`);
    i = j + 1;
  }
  return runs;
}
