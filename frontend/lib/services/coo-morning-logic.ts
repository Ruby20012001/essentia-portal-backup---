import { formatINR } from "@/lib/format";
import type { BriefNumber, BriefStatus } from "@/lib/services/founder-brief";

/**
 * S8 · COO — the four Morning Numbers and the cross-vertical health strip, as
 * pure rules (no database), so the thresholds are tested rather than trusted.
 * Spec: docs/reference/Portal_UI_18_Screens_BuildSequence.html #dash-coo.
 *
 * Day N of a clock is CURRENT_DATE − initiated_date, computed in SQL. The WIO
 * clock is 15 days (Day 12+ = three days left to convert); the PIO factory
 * clock is 45 days (Day 40+ = the final stretch). AR thresholds follow Brief
 * §36 as seeded in db/004: 45 days goes to the TL, 60 to the COO.
 */

export const WIO_WATCH_DAY = 12;
export const WIO_CLOCK_DAYS = 15;
export const PIO_WATCH_DAY = 40;
export const PIO_CLOCK_DAYS = 45;
export const AR_WATCH_DAYS = 30;
export const AR_TL_DAYS = 45;
export const AR_COO_DAYS = 60;

export type ClockRow = { ref: string; project: string | null; day: number };

export type ArInvoice = {
  project: string | null;
  family: string | null;
  invoiceNumber: string | null;
  outstanding: number;
  days: number;
  tl: string | null;
};

export type ArAction = "Escalate" | "Follow up" | "Monitor";

export type Rag = "green" | "amber" | "red";

export type VerticalHealth = {
  name: string;
  rag: Rag;
  value: string;
  detail: string;
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function wioNumber(rows: ClockRow[]): BriefNumber {
  const late = rows.filter((r) => r.day >= WIO_WATCH_DAY);
  const overdue = late.filter((r) => r.day > WIO_CLOCK_DAYS);
  const status: BriefStatus = overdue.length > 0 ? "action" : late.length > 0 ? "watch" : "ok";
  return {
    n: 1,
    label: `WIOs at Day ${WIO_WATCH_DAY}+`,
    value: `${plural(late.length, "WIO")}${overdue.length ? ` · ${overdue.length} past Day ${WIO_CLOCK_DAYS}` : ""}`,
    detail: overdue.length
      ? "Past the 15-day window. Each one is a project delayed before it starts."
      : late.length
        ? "Convert to PIO in 3 days or less."
        : "Every WIO is inside its first 12 days.",
    status,
  };
}

export function pioNumber(rows: ClockRow[]): BriefNumber {
  const late = rows.filter((r) => r.day >= PIO_WATCH_DAY);
  const overdue = late.filter((r) => r.day > PIO_CLOCK_DAYS);
  const status: BriefStatus =
    rows.length === 0 ? "none" : overdue.length > 0 ? "action" : late.length > 0 ? "watch" : "ok";
  return {
    n: 2,
    label: `PIOs at Day ${PIO_WATCH_DAY}+`,
    value: rows.length ? `${plural(late.length, "PIO")} of ${rows.length} in production` : "None in production",
    detail:
      rows.length === 0
        ? "No PIOs on the factory clock."
        : overdue.length
          ? `${overdue.length} past Day ${PIO_CLOCK_DAYS}. NH8 needs a recovery date today.`
          : late.length
            ? "Factory final stretch."
            : "Every PIO is comfortably inside the 45-day clock.",
    status,
  };
}

export function stockNumber(): BriefNumber {
  return {
    n: 3,
    label: "EH stock to reorder",
    value: "Not yet wired",
    detail: "SKUs below their reorder level arrive with the Zakya stock feed.",
    status: "unwired",
  };
}

export function arNumber(invoices: ArInvoice[]): BriefNumber {
  const aged = invoices.filter((i) => i.days > AR_WATCH_DAYS && i.outstanding > 0);
  const total = aged.reduce((n, i) => n + i.outstanding, 0);
  const coo = aged.filter((i) => i.days >= AR_COO_DAYS);
  const status: BriefStatus = coo.length > 0 ? "action" : aged.length > 0 ? "watch" : "ok";
  return {
    n: 4,
    label: `AR over ${AR_WATCH_DAYS} days`,
    value: aged.length ? `${formatINR(total)} on ${plural(aged.length, "invoice")}` : "Nothing over 30 days",
    detail: coo.length
      ? `${plural(coo.length, "invoice")} at ${AR_COO_DAYS}+ days. These are yours to escalate.`
      : aged.length
        ? "TL follow-up required today."
        : "Every raised invoice is inside 30 days.",
    status,
  };
}

/** What the AR table asks of the COO, by the §36 ladder. */
export function arAction(days: number): ArAction {
  if (days >= AR_COO_DAYS) return "Escalate";
  if (days >= AR_TL_DAYS) return "Follow up";
  return "Monitor";
}

/** Oldest first, then largest, so the top row is the one to act on. */
export function agedInvoices(invoices: ArInvoice[]): ArInvoice[] {
  return invoices
    .filter((i) => i.days > AR_WATCH_DAYS && i.outstanding > 0)
    .sort((a, b) => b.days - a.days || b.outstanding - a.outstanding);
}

export function eeHealth(r: { green: number; amber: number; red: number }): VerticalHealth {
  const total = r.green + r.amber + r.red;
  return {
    name: "EE projects",
    rag: r.red > 3 ? "red" : r.red > 0 || r.amber > 8 ? "amber" : "green",
    value: total ? `${r.green} on track · ${r.amber} watch · ${r.red} behind` : "No active projects",
    detail: total ? `${plural(total, "active project")}` : "Nothing on the books yet.",
  };
}

export function factoryHealth(rows: ClockRow[]): VerticalHealth {
  const late = rows.filter((r) => r.day >= PIO_WATCH_DAY).length;
  const overdue = rows.filter((r) => r.day > PIO_CLOCK_DAYS).length;
  return {
    name: "NH8 factory",
    rag: overdue > 0 ? "red" : late > 0 ? "amber" : "green",
    value: rows.length ? `${plural(rows.length, "PIO")} in production` : "Factory clock empty",
    detail: !rows.length
      ? "Nothing in production"
      : overdue
        ? `${overdue} past Day 45`
        : late
          ? `${late} in the final stretch`
          : "All inside the clock",
  };
}

/**
 * A centre is judged against pace, not the full month: on the 10th of a
 * 30-day month a third of target is on track. A discount that reached a
 * family before sign-off is red whatever the sales are (Velocity Gate 5).
 */
export function centreHealth(
  c: { name: string; target: number; mtd: number; violations: number },
  dayOfMonth: number,
  daysInMonth: number,
): VerticalHealth {
  const pct = c.target > 0 ? Math.round((c.mtd / c.target) * 100) : null;
  const pace = c.target > 0 ? c.mtd / ((c.target * dayOfMonth) / daysInMonth) : null;
  const rag: Rag =
    c.violations > 0 ? "red" : pace === null ? "amber" : pace >= 0.9 ? "green" : pace >= 0.6 ? "amber" : "red";
  return {
    // Centre names already carry the brand ("essentia home — Gurugram
    // Flagship"); the strip only needs which centre.
    name: `EH ${c.name.replace(/^essentia home\s*[—–-]\s*/i, "")}`,
    rag,
    value: pct === null ? `${formatINR(c.mtd)} · no target set` : `${pct}% of month target`,
    detail: c.violations
      ? `${plural(c.violations, "discount")} told to a family before approval`
      : "No discount violations this month",
  };
}
