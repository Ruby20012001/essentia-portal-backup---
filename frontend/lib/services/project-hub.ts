import { withUserContext } from "@/lib/db";
import type { SessionUser } from "@/lib/auth/session";

/**
 * Project Hub (Brief: "Client + Commercial · Project Hub") — the central record
 * for every active project. Every other module links here. READ-ONLY: this
 * surfaces the existing project spine (ee.projects + team + phases + billing +
 * linked WIO/PIO) — it writes nothing and adds no business logic.
 *
 * Row visibility is enforced by Postgres RLS through withUserContext: L0/L1 see
 * every project, L2 sees their department's, L3 sees only projects assigned to
 * them (proj_access policy). Financial figures are additionally fenced — the
 * caller passes canSeeFinancials (read:billing) and the UI hides them otherwise;
 * billing_milestones rows are RLS-limited to L0/L1 on top of that.
 */

export type Rag = "green" | "amber" | "red";

export type ProjectSummary = {
  id: string;
  projectCode: string;
  projectName: string | null;
  familyName: string | null;
  city: string | null;
  projectType: string | null;
  isDubai: boolean;
  currentPhase: string;
  ragStatus: Rag;
  ragNotes: string | null;
  crmTl: string | null;
  projectValueEst: number | null;
  arOutstanding: number | null;
  targetDorDate: string | null;
};

const num = (v: unknown): number | null => (v == null ? null : Number(v));

const SUMMARY_COLS = `p.id, p.project_code, p.project_name, f.primary_contact AS family_name,
  p.city, p.project_type, p.is_dubai, p.current_phase, p.rag_status, p.rag_notes,
  tl.full_name AS crm_tl, p.project_value_est, p.ar_outstanding,
  p.target_dor_date::text AS target_dor_date`;

const RAG_ORDER = `CASE p.rag_status WHEN 'red' THEN 0 WHEN 'amber' THEN 1 ELSE 2 END`;

type SummaryRow = {
  id: string; project_code: string; project_name: string | null; family_name: string | null;
  city: string | null; project_type: string | null; is_dubai: boolean; current_phase: string;
  rag_status: Rag; rag_notes: string | null; crm_tl: string | null;
  project_value_est: string | null; ar_outstanding: string | null; target_dor_date: string | null;
};

function toSummary(r: SummaryRow): ProjectSummary {
  return {
    id: r.id, projectCode: r.project_code, projectName: r.project_name, familyName: r.family_name,
    city: r.city, projectType: r.project_type, isDubai: r.is_dubai, currentPhase: r.current_phase,
    ragStatus: r.rag_status, ragNotes: r.rag_notes, crmTl: r.crm_tl,
    projectValueEst: num(r.project_value_est), arOutstanding: num(r.ar_outstanding),
    targetDorDate: r.target_dor_date,
  };
}

/** Every active project the caller may see (RLS-scoped), red health first. */
export async function listProjectHub(user: SessionUser): Promise<ProjectSummary[]> {
  return withUserContext(user, async (q) => {
    const rows = await q<SummaryRow>(
      `SELECT ${SUMMARY_COLS}
       FROM ee.projects p
       LEFT JOIN public.families f ON f.id = p.family_id
       LEFT JOIN public.users tl ON tl.id = p.crmtl_id
       WHERE p.is_active
       ORDER BY ${RAG_ORDER}, p.project_code`,
    );
    return rows.map(toSummary);
  });
}

export type TeamMember = { role: string; name: string | null };
export type ProjectPhaseRow = {
  phase: string;
  status: string;
  completionPct: number;
  plannedStart: string | null;
  plannedEnd: string | null;
  actualStart: string | null;
  actualEnd: string | null;
};
export type BillingRow = {
  name: string;
  sequenceNo: number | null;
  amount: number;
  amountPaid: number;
  isDue: boolean;
  dueDate: string | null;
  invoiceRaised: boolean;
  invoiceNumber: string | null;
  state: "paid" | "part_paid" | "overdue" | "due" | "upcoming";
};
export type DocRow = { ref: string; kind: "WIO" | "PIO"; extra: string | null; status: string; rag: Rag | null };

export type ProjectDetail = ProjectSummary & {
  siteAddress: string | null;
  totalAreaSqft: number | null;
  firstInstalmentDate: string | null;
  actualDorDate: string | null;
  designFeeTotal: number | null;
  pmcFeeTotal: number | null;
  familyCode: string | null;
  profileCompletePct: number | null;
  team: TeamMember[];
  phases: ProjectPhaseRow[];
  billing: BillingRow[];
  documents: DocRow[];
};

type DetailRow = SummaryRow & {
  site_address: string | null; total_area_sqft: string | null;
  first_instalment_date: string | null; actual_dor_date: string | null;
  design_fee_total: string | null; pmc_fee_total: string | null;
  family_code: string | null; profile_complete_pct: number | null;
  crmtl: string | null; pmc: string | null; designer: string | null;
  architect: string | null; visualiser: string | null; site_supervisor: string | null;
};

/** One project fully expanded. Returns null if it doesn't exist or the caller can't see it. */
export async function getProjectDetail(user: SessionUser, id: string): Promise<ProjectDetail | null> {
  return withUserContext(user, async (q) => {
    const [p] = await q<DetailRow>(
      `SELECT ${SUMMARY_COLS},
              p.site_address, p.total_area_sqft,
              p.first_instalment_date::text AS first_instalment_date,
              p.actual_dor_date::text AS actual_dor_date,
              p.design_fee_total, p.pmc_fee_total,
              f.family_code, f.profile_complete_pct,
              tl.full_name AS crmtl, pmc.full_name AS pmc, des.full_name AS designer,
              arc.full_name AS architect, vis.full_name AS visualiser, ss.full_name AS site_supervisor
       FROM ee.projects p
       LEFT JOIN public.families f ON f.id = p.family_id
       LEFT JOIN public.users tl  ON tl.id  = p.crmtl_id
       LEFT JOIN public.users pmc ON pmc.id = p.pmc_id
       LEFT JOIN public.users des ON des.id = p.designer_id
       LEFT JOIN public.users arc ON arc.id = p.architect_id
       LEFT JOIN public.users vis ON vis.id = p.visualiser_id
       LEFT JOIN public.users ss  ON ss.id  = p.site_supervisor_id
       WHERE p.id = $1 AND p.is_active`,
      [id],
    );
    if (!p) return null;

    const phaseRows = await q<{
      phase: string; status: string; completion_pct: number;
      planned_start: string | null; planned_end: string | null;
      actual_start: string | null; actual_end: string | null;
    }>(
      `SELECT phase, status, completion_pct,
              planned_start::text, planned_end::text, actual_start::text, actual_end::text
       FROM ee.activity_phases WHERE project_id = $1 ORDER BY phase`,
      [id],
    );

    const billingRows = await q<{
      milestone_name: string; sequence_no: number | null; amount: string; amount_paid: string;
      is_due: boolean; due_date: string | null; invoice_raised: boolean; invoice_number: string | null;
    }>(
      `SELECT milestone_name, sequence_no, amount, amount_paid, is_due,
              due_date::text AS due_date, invoice_raised, invoice_number
       FROM ee.billing_milestones WHERE project_id = $1 ORDER BY sequence_no NULLS LAST`,
      [id],
    );

    const wioRows = await q<{ wio_number: string; department_code: string; status: string; days_remaining: number | null }>(
      `SELECT wio_number, department_code, status,
              (target_pio_date - CURRENT_DATE)::int AS days_remaining
       FROM ee.wio WHERE project_id = $1 ORDER BY initiated_date DESC`,
      [id],
    );
    const pioRows = await q<{ pio_number: string; status: string }>(
      `SELECT pio_number, status FROM ee.pio WHERE project_id = $1 ORDER BY initiated_date DESC`,
      [id],
    );

    const team: TeamMember[] = [
      { role: "CRM Team Lead", name: p.crmtl },
      { role: "PMC", name: p.pmc },
      { role: "Designer", name: p.designer },
      { role: "Architect", name: p.architect },
      { role: "Visualiser", name: p.visualiser },
      { role: "Site Supervisor", name: p.site_supervisor },
    ].filter((m) => m.name);

    const billing: BillingRow[] = billingRows.map((b) => {
      const amount = Number(b.amount);
      const paid = Number(b.amount_paid);
      const overdue = b.due_date != null && new Date(b.due_date) < new Date() && paid < amount;
      const state: BillingRow["state"] =
        paid >= amount && amount > 0 ? "paid" : paid > 0 ? "part_paid" : overdue ? "overdue" : b.is_due ? "due" : "upcoming";
      return {
        name: b.milestone_name, sequenceNo: b.sequence_no, amount, amountPaid: paid,
        isDue: b.is_due, dueDate: b.due_date, invoiceRaised: b.invoice_raised,
        invoiceNumber: b.invoice_number, state,
      };
    });

    const documents: DocRow[] = [
      ...wioRows.map((w): DocRow => ({
        ref: w.wio_number,
        kind: "WIO",
        extra: w.department_code,
        status: w.status,
        rag: w.days_remaining == null ? null : w.days_remaining <= 2 ? "red" : w.days_remaining <= 5 ? "amber" : "green",
      })),
      ...pioRows.map((p2): DocRow => ({ ref: p2.pio_number, kind: "PIO", extra: null, status: p2.status, rag: null })),
    ];

    return {
      ...toSummary(p),
      siteAddress: p.site_address,
      totalAreaSqft: num(p.total_area_sqft),
      firstInstalmentDate: p.first_instalment_date,
      actualDorDate: p.actual_dor_date,
      designFeeTotal: num(p.design_fee_total),
      pmcFeeTotal: num(p.pmc_fee_total),
      familyCode: p.family_code,
      profileCompletePct: p.profile_complete_pct,
      team,
      phases: phaseRows.map((r) => ({
        phase: r.phase, status: r.status, completionPct: r.completion_pct,
        plannedStart: r.planned_start, plannedEnd: r.planned_end,
        actualStart: r.actual_start, actualEnd: r.actual_end,
      })),
      billing,
      documents,
    };
  });
}
