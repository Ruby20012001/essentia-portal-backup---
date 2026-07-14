import { query } from "@/lib/db";
import { formatINR } from "@/lib/format";
import type { SessionUser } from "@/lib/auth/session";

/**
 * Founder Morning Brief (Brief §37 — Founder Liberation Framework; Velocity
 * Gate #6). "The 7 Numbers Hardesh reads every morning — nothing more." Each
 * number carries a threshold-derived status so the founder reads it in the
 * 7-minute test without interpretation. Read-only, org-wide, live data only —
 * a number with no source yet reports `unwired`, never a fabricated value.
 */

export type BriefStatus = "ok" | "watch" | "action" | "none" | "unwired";

export type BriefNumber = {
  n: number;
  label: string;
  value: string;
  detail: string;
  status: BriefStatus;
};

export type FounderBrief = { numbers: BriefNumber[] };

const CR = 10_000_000; // ₹1 Cr
const L20 = 2_000_000; // ₹20L

export async function getFounderBrief(): Promise<FounderBrief> {
  const [rag] = await query<{ on_track: number; watch: number; behind: number }>(
    `SELECT COUNT(*) FILTER (WHERE rag_status='green')::int AS on_track,
            COUNT(*) FILTER (WHERE rag_status='amber')::int AS watch,
            COUNT(*) FILTER (WHERE rag_status='red')::int  AS behind
     FROM ee.projects WHERE is_active`,
  );

  const stores = await query<{ code: string; target: number | null; mtd: number }>(
    `SELECT ec.code, ec.target_monthly::float8 AS target,
            COALESCE(SUM(s.net_amount) FILTER (
              WHERE date_trunc('month', s.sale_date) = date_trunc('month', CURRENT_DATE)
            ), 0)::float8 AS mtd
     FROM eh.experience_centres ec
     LEFT JOIN eh.sales s ON s.ec_id = ec.id
     GROUP BY ec.id, ec.code, ec.target_monthly
     ORDER BY ec.code`,
  );

  const [pio] = await query<{ active: number; approaching: number }>(
    `SELECT COUNT(*) FILTER (WHERE status NOT IN ('installed','dispatched'))::int AS active,
            COUNT(*) FILTER (
              WHERE status NOT IN ('installed','dispatched')
                AND target_complete IS NOT NULL
                AND (target_complete - CURRENT_DATE) <= 10
            )::int AS approaching
     FROM ee.pio`,
  );

  const [ar] = await query<{ total_ar: number; with_ar: number; max_ar: number; over_20l: number }>(
    `SELECT COALESCE(SUM(ar_outstanding),0)::float8 AS total_ar,
            COUNT(*) FILTER (WHERE ar_outstanding > 0)::int AS with_ar,
            COALESCE(MAX(ar_outstanding),0)::float8 AS max_ar,
            COUNT(*) FILTER (WHERE ar_outstanding > ${L20})::int AS over_20l
     FROM ee.projects WHERE is_active`,
  );

  const [wio] = await query<{ at_risk: number; overdue: number }>(
    `SELECT COUNT(*)::int AS at_risk,
            COUNT(*) FILTER (WHERE is_overdue)::int AS overdue
     FROM ee.wio_clock WHERE days_remaining <= 5`,
  );

  const [esc] = await query<{ founder_escalations: number }>(
    `SELECT COUNT(DISTINCT i.id)::int AS founder_escalations
     FROM portal.workflow_instances i
     JOIN portal.workflow_tasks t
       ON t.instance_id = i.id AND t.group_no = i.current_step AND t.status = 'pending'
     JOIN public.users u ON u.id = COALESCE(t.delegated_to_user_id, t.assignee_user_id)
     WHERE i.status = 'pending' AND u.access_level = 'L0'`,
  );

  const dayOfMonth = new Date().getDate();

  const numbers: BriefNumber[] = [
    number1RAG(rag),
    number2EH(stores, dayOfMonth),
    number3PIO(pio),
    number4AR(ar),
    number5WIO(wio),
    number6Escalations(esc.founder_escalations),
    number7People(),
  ];

  return { numbers };
}

/**
 * Velocity Gate #6 — the auto-pilot's 6:30am job. Generates the 7 numbers and
 * persists one snapshot per day (idempotent upsert), so the brief is "generated"
 * even if the underlying data moves later in the day. Called by the scheduler
 * ('founder-morning-brief' handler); safe to re-run (same day → updates in place).
 */
export async function snapshotFounderBrief(actor: SessionUser): Promise<{ briefDate: string; numbers: number }> {
  const { numbers } = await getFounderBrief();
  const [row] = await query<{ brief_date: string }>(
    `INSERT INTO portal.founder_brief_snapshots (brief_date, generated_by, numbers, generated_at)
     VALUES (CURRENT_DATE, $1, $2::jsonb, NOW())
     ON CONFLICT (brief_date) DO UPDATE
       SET numbers = EXCLUDED.numbers, generated_at = NOW(), generated_by = EXCLUDED.generated_by
     RETURNING brief_date::text AS brief_date`,
    [actor.id, JSON.stringify(numbers)],
  );
  return { briefDate: row!.brief_date, numbers: numbers.length };
}

/** The most recent auto-generated snapshot (for the "auto-generated at" indicator). */
export async function getLatestBriefSnapshot(): Promise<{ briefDate: string; generatedAt: string } | null> {
  const [row] = await query<{ brief_date: string; generated_at: string }>(
    `SELECT brief_date::text AS brief_date, generated_at::text AS generated_at
     FROM portal.founder_brief_snapshots
     ORDER BY brief_date DESC LIMIT 1`,
  );
  return row ? { briefDate: row.brief_date, generatedAt: row.generated_at } : null;
}

function number1RAG(r: { on_track: number; watch: number; behind: number }): BriefNumber {
  const status: BriefStatus = r.behind > 3 ? "action" : r.watch > 8 ? "watch" : "ok";
  return {
    n: 1,
    label: "Active projects RAG",
    value: `${r.on_track} on track · ${r.watch} watch · ${r.behind} behind`,
    detail:
      r.behind > 3
        ? "Behind > 3 — action needed today."
        : r.watch > 8
          ? "Watch > 8 — systemic issue to review."
          : "Within tolerance.",
    status,
  };
}

function number2EH(stores: Array<{ code: string; target: number | null; mtd: number }>, dayOfMonth: number): BriefNumber {
  if (stores.length === 0) {
    return { n: 2, label: "EH MTD revenue vs target", value: "No experience centres configured", detail: "Awaiting EH store + Zakya sales data.", status: "unwired" };
  }
  const parts = stores.map((s) => {
    const pct = s.target && s.target > 0 ? Math.round((s.mtd / s.target) * 100) : null;
    return `${s.code} ${formatINR(s.mtd)}${pct != null ? ` (${pct}%)` : ""}`;
  });
  // After the 20th, any store below 60% of target is an action.
  const behind = stores.filter((s) => s.target && s.target > 0 && s.mtd / s.target < 0.6);
  const status: BriefStatus = dayOfMonth >= 20 && behind.length > 0 ? "action" : behind.length > 0 ? "watch" : "ok";
  return {
    n: 2,
    label: "EH MTD revenue vs target",
    value: parts.join(" · "),
    detail:
      dayOfMonth >= 20 && behind.length > 0
        ? `${behind.map((s) => s.code).join(", ")} below 60% past the 20th — Country Head to recover.`
        : behind.length > 0
          ? `${behind.map((s) => s.code).join(", ")} tracking below 60%.`
          : "On or above pace.",
    status,
  };
}

function number3PIO(p: { active: number; approaching: number }): BriefNumber {
  const status: BriefStatus = p.active === 0 ? "none" : p.approaching > 0 ? "watch" : "ok";
  return {
    n: 3,
    label: "NH8 production health",
    value: `${p.active} in production · ${p.approaching} approaching Day 45`,
    detail: p.active === 0 ? "No PIOs on the factory clock." : p.approaching > 0 ? "PIOs nearing the 45-day mark — watch resting items." : "All PIOs comfortably inside the clock.",
    status,
  };
}

function number4AR(a: { total_ar: number; with_ar: number; max_ar: number; over_20l: number }): BriefNumber {
  const status: BriefStatus = a.over_20l > 0 ? "action" : a.total_ar > CR ? "watch" : a.total_ar > 0 ? "ok" : "none";
  return {
    n: 4,
    label: "AR outstanding",
    value: `${formatINR(a.total_ar)} across ${a.with_ar} project${a.with_ar === 1 ? "" : "s"}`,
    detail:
      a.over_20l > 0
        ? `${a.over_20l} single AR above ₹20L (largest ${formatINR(a.max_ar)}) — Deepak Ji action.`
        : "Day-level aging (>45/60d) arrives with the billing module.",
    status,
  };
}

function number5WIO(w: { at_risk: number; overdue: number }): BriefNumber {
  const status: BriefStatus = w.overdue > 0 ? "action" : w.at_risk > 0 ? "watch" : "ok";
  return {
    n: 5,
    label: "WIOs at risk (Day 10+)",
    value: `${w.at_risk} at risk · ${w.overdue} overdue`,
    detail: w.overdue > 0 ? "Overdue conversions — each is a project delayed before it starts." : w.at_risk > 0 ? "Approaching the 15-day PIO conversion window." : "Every WIO clock inside tolerance.",
    status,
  };
}

function number6Escalations(count: number): BriefNumber {
  const status: BriefStatus = count > 3 ? "action" : count > 0 ? "watch" : "ok";
  return {
    n: 6,
    label: "Open escalations requiring founder",
    value: `${count} awaiting a founder`,
    detail: count > 3 ? "Regularly above 3 — the delegation matrix needs review." : count > 0 ? "Escalated to a founder decision." : "Zero — the delegation matrix is holding.",
    status,
  };
}

function number7People(): BriefNumber {
  return {
    n: 7,
    label: "People alerts",
    value: "Not yet wired",
    detail: "Confirmed exits, unresolved performance flags (14d+) and senior vacancies (60d+) arrive with the HR / Keka module.",
    status: "unwired",
  };
}
