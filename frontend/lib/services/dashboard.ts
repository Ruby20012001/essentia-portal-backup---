import { withUserContext, type UserContext } from "@/lib/db";

/**
 * S2 · CRM TL Dashboard data (Blueprint §04 wireframe: signal first, metrics
 * second, detail third). Every query runs inside withUserContext, so Postgres
 * RLS scopes rows to the acting user — an L2 TL sees only their projects.
 * Priority signals are the deterministic SQL tier; the AI Priority Signals
 * layer (Brief §37) will extend, not replace, these.
 */

export type PrioritySignal = {
  severity: "red" | "amber";
  message: string;
  href: string;
};

export type WioClockRow = {
  wioNumber: string;
  projectCode: string;
  familyName: string;
  department: string;
  daysRemaining: number;
  clockRag: "green" | "amber" | "red";
  checklistComplete: boolean;
  isOverdue: boolean;
};

export type ProjectRiskRow = {
  projectCode: string;
  projectName: string | null;
  familyName: string | null;
  phase: string;
  ragStatus: "green" | "amber" | "red";
  arOutstanding: number;
  targetDor: string | null;
};

export type CrmtlDashboard = {
  metrics: {
    activeProjects: number;
    openWios: number;
    arOutstanding: number;
    pulsesSent: number;
    pulsesDue: number;
  };
  prioritySignals: PrioritySignal[];
  wioClock: WioClockRow[];
  projectsByRisk: ProjectRiskRow[];
};

export async function getCrmtlDashboard(
  user: UserContext,
): Promise<CrmtlDashboard> {
  return withUserContext(user, async (q) => {
    const [metrics] = await q<{
      active_projects: number;
      open_wios: number;
      ar_outstanding: number;
      pulses_sent: number;
    }>(`
      SELECT
        (SELECT COUNT(*)::INT FROM ee.projects WHERE is_active) AS active_projects,
        (SELECT COUNT(*)::INT FROM ee.wio_clock) AS open_wios,
        (SELECT COALESCE(SUM(ar_outstanding), 0)::FLOAT8
           FROM ee.projects WHERE is_active) AS ar_outstanding,
        (SELECT COUNT(*)::INT
           FROM portal.communication_spine cs
           JOIN ee.projects p ON p.id = cs.project_id
          WHERE cs.letter_type = 'weekly_pulse'
            AND cs.sent_at >= date_trunc('week', CURRENT_DATE)) AS pulses_sent
    `);

    const wioClock = await q<{
      wio_number: string;
      project_code: string;
      family_name: string;
      department_code: string;
      days_remaining: number;
      clock_rag: WioClockRow["clockRag"];
      checklist_complete: boolean;
      is_overdue: boolean;
    }>(`
      SELECT wio_number, project_code, family_name, department_code,
             days_remaining, clock_rag, checklist_complete, is_overdue
      FROM ee.wio_clock
      ORDER BY days_remaining ASC
      LIMIT 12
    `);

    const projects = await q<{
      project_code: string;
      project_name: string | null;
      family_name: string | null;
      current_phase: string;
      rag_status: ProjectRiskRow["ragStatus"];
      ar_outstanding: number;
      target_dor_date: string | null;
    }>(`
      SELECT p.project_code, p.project_name, f.primary_contact AS family_name,
             p.current_phase, p.rag_status,
             COALESCE(p.ar_outstanding, 0)::FLOAT8 AS ar_outstanding,
             p.target_dor_date::TEXT
      FROM ee.projects p
      LEFT JOIN public.families f ON f.id = p.family_id
      WHERE p.is_active
      ORDER BY CASE p.rag_status WHEN 'red' THEN 0 WHEN 'amber' THEN 1 ELSE 2 END,
               p.ar_outstanding DESC NULLS LAST
      LIMIT 12
    `);

    const [signalCounts] = await q<{
      red_projects: number;
      overdue_wios: number;
      overdue_invoices: number;
    }>(`
      SELECT
        (SELECT COUNT(*)::INT FROM ee.projects
          WHERE is_active AND rag_status = 'red') AS red_projects,
        (SELECT COUNT(*)::INT FROM ee.wio_clock WHERE is_overdue) AS overdue_wios,
        (SELECT COUNT(*)::INT
           FROM ee.billing_status b
           JOIN ee.projects p ON p.id = b.project_id
          WHERE b.is_overdue) AS overdue_invoices
    `);

    const pulsesDue = metrics.active_projects;
    const pulsesMissing = Math.max(0, pulsesDue - metrics.pulses_sent);

    const prioritySignals: PrioritySignal[] = [];
    if (signalCounts.red_projects > 0) {
      prioritySignals.push({
        severity: "red",
        message: `${signalCounts.red_projects} project${signalCounts.red_projects > 1 ? "s" : ""} flagged red — needs your attention this morning`,
        href: "/dashboard#projects",
      });
    }
    if (signalCounts.overdue_wios > 0) {
      prioritySignals.push({
        severity: "red",
        message: `${signalCounts.overdue_wios} WIO${signalCounts.overdue_wios > 1 ? "s" : ""} past the 15-day conversion clock`,
        href: "/wio-pio",
      });
    }
    if (signalCounts.overdue_invoices > 0) {
      prioritySignals.push({
        severity: "amber",
        message: `${signalCounts.overdue_invoices} invoice${signalCounts.overdue_invoices > 1 ? "s" : ""} overdue for payment`,
        href: "/dashboard#projects",
      });
    }
    if (pulsesMissing > 0) {
      prioritySignals.push({
        severity: "amber",
        message: `${pulsesMissing} Weekly Pulse${pulsesMissing > 1 ? "s" : ""} not yet sent this week`,
        href: "/communication",
      });
    }

    return {
      metrics: {
        activeProjects: metrics.active_projects,
        openWios: metrics.open_wios,
        arOutstanding: metrics.ar_outstanding,
        pulsesSent: metrics.pulses_sent,
        pulsesDue,
      },
      prioritySignals,
      wioClock: wioClock.map((w) => ({
        wioNumber: w.wio_number,
        projectCode: w.project_code,
        familyName: w.family_name,
        department: w.department_code,
        daysRemaining: w.days_remaining,
        clockRag: w.clock_rag,
        checklistComplete: w.checklist_complete,
        isOverdue: w.is_overdue,
      })),
      projectsByRisk: projects.map((p) => ({
        projectCode: p.project_code,
        projectName: p.project_name,
        familyName: p.family_name,
        phase: p.current_phase,
        ragStatus: p.rag_status,
        arOutstanding: p.ar_outstanding,
        targetDor: p.target_dor_date,
      })),
    };
  });
}
