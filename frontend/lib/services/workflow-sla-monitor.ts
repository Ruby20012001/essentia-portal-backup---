import { query } from "@/lib/db";

/**
 * SLA monitor read model (frontend screen 8). Read-only aggregates over the
 * timer state the sweep already maintains — no new timer logic, no writes.
 *
 * The trend series is only possible because the sweep stamps sla_warned_at /
 * sla_breached_at (db/026): those are the moments the warning and breach
 * actually fired, so counting by day is a true history rather than a snapshot.
 */

export type SlaMonitorCounts = {
  approaching: number; // warned, still pending, not yet breached
  breached: number; // breached and still pending
  escalated: number; // tasks handed to an escalation target
  timedOut: number; // tasks closed by a timeout action
};

export async function getSlaMonitorCounts(): Promise<SlaMonitorCounts> {
  const [row] = await query<SlaMonitorCounts>(
    `SELECT
       COUNT(*) FILTER (
         WHERE status = 'pending' AND sla_warned_at IS NOT NULL AND sla_breached_at IS NULL
       )::int AS approaching,
       COUNT(*) FILTER (
         WHERE status = 'pending' AND sla_breached_at IS NOT NULL
       )::int AS breached,
       COUNT(*) FILTER (WHERE status = 'escalated')::int AS escalated,
       COUNT(*) FILTER (WHERE status = 'timed_out')::int AS "timedOut"
     FROM portal.workflow_tasks`,
  );
  return row ?? { approaching: 0, breached: 0, escalated: 0, timedOut: 0 };
}

export type SlaTrendPoint = { day: string; warnings: number; breaches: number };

/**
 * Daily warning/breach counts over the last `days`, oldest first. Days with no
 * activity are returned as zeroes so the chart has no gaps.
 */
export async function getSlaTrend(days = 14): Promise<SlaTrendPoint[]> {
  const window = Math.max(1, Math.min(days, 90));
  return query<SlaTrendPoint>(
    `SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
            COALESCE(w.n, 0)::int AS warnings,
            COALESCE(b.n, 0)::int AS breaches
     FROM generate_series(CURRENT_DATE - ${window - 1}, CURRENT_DATE, INTERVAL '1 day') AS d(day)
     LEFT JOIN (
       SELECT date_trunc('day', sla_warned_at) AS day, COUNT(*) AS n
       FROM portal.workflow_tasks WHERE sla_warned_at IS NOT NULL
       GROUP BY 1
     ) w ON w.day = d.day
     LEFT JOIN (
       SELECT date_trunc('day', sla_breached_at) AS day, COUNT(*) AS n
       FROM portal.workflow_tasks WHERE sla_breached_at IS NOT NULL
       GROUP BY 1
     ) b ON b.day = d.day
     ORDER BY d.day`,
  );
}
