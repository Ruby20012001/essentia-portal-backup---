/**
 * SLA-breach risk for a workflow's pending group.
 *
 * Deterministic and pure — the level comes from the deadlines themselves, not
 * from a judgement call. It was previously carried alongside the workflow AI
 * advisory; that advisory has been removed and this stands on its own, which is
 * what it always did anyway.
 */

export type SlaRisk = {
  level: "none" | "ok" | "medium" | "high" | "breached";
  hoursRemaining: number | null;
  breachedCount: number;
  pendingCount: number;
};

export function computeSlaRisk(now: Date, slaDueAts: Array<string | null>): SlaRisk {
  const pendingCount = slaDueAts.length;
  const due = slaDueAts
    .filter((d): d is string => Boolean(d))
    .map((d) => new Date(d).getTime())
    .filter((t) => Number.isFinite(t));
  if (due.length === 0) return { level: "none", hoursRemaining: null, breachedCount: 0, pendingCount };
  const nowMs = now.getTime();
  const breachedCount = due.filter((t) => t <= nowMs).length;
  if (breachedCount > 0) return { level: "breached", hoursRemaining: 0, breachedCount, pendingCount };
  const hoursRemaining = (Math.min(...due) - nowMs) / 3_600_000;
  const level = hoursRemaining < 12 ? "high" : hoursRemaining < 24 ? "medium" : "ok";
  return { level, hoursRemaining: Math.round(hoursRemaining * 10) / 10, breachedCount: 0, pendingCount };
}
