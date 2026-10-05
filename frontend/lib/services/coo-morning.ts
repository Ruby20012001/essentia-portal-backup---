import { withUserContext } from "@/lib/db";
import type { SessionUser } from "@/lib/auth/session";
import type { BriefNumber } from "@/lib/services/founder-brief";
import {
  agedInvoices,
  arNumber,
  centreHealth,
  eeHealth,
  factoryHealth,
  pioNumber,
  stockNumber,
  wioNumber,
  type ArInvoice,
  type ClockRow,
  type VerticalHealth,
} from "@/lib/services/coo-morning-logic";

/**
 * S8 · COO — the Morning Numbers, the cross-vertical health strip and AR
 * ageing. Read-only. Every read runs inside withUserContext, so RLS fences it
 * the same way it fences the rest of the portal: the page only calls this for
 * leadership, and if that check ever slips, the rows still will not come back.
 */

export type CooMorning = {
  numbers: BriefNumber[];
  health: VerticalHealth[];
  invoices: ArInvoice[];
};

export async function getCooMorning(user: SessionUser, now: Date = new Date()): Promise<CooMorning> {
  return withUserContext(user, async (q) => {
    const wios = await q<ClockRow>(
      `SELECT wio_number AS ref, project_name AS project,
              (CURRENT_DATE - initiated_date)::int AS day
         FROM ee.wio_clock`,
    );

    const pios = await q<ClockRow>(
      `SELECT pio_number AS ref, project_name AS project,
              (CURRENT_DATE - initiated_date)::int AS day
         FROM ee.pio_factory_clock
        WHERE status NOT IN ('dispatched')`,
    );

    const invoices = await q<ArInvoice>(
      `SELECT p.project_name AS project,
              f.primary_contact AS family,
              b.invoice_number AS "invoiceNumber",
              (b.amount - b.amount_paid)::float8 AS outstanding,
              (CURRENT_DATE - b.invoice_date)::int AS days,
              tl.full_name AS tl
         FROM ee.billing_milestones b
         JOIN ee.projects p ON p.id = b.project_id
         LEFT JOIN public.families f ON f.id = p.family_id
         LEFT JOIN public.users tl ON tl.id = p.crmtl_id
        WHERE b.invoice_raised
          AND b.invoice_date IS NOT NULL
          AND b.amount_paid < b.amount`,
    );

    const [rag] = await q<{ green: number; amber: number; red: number }>(
      `SELECT COUNT(*) FILTER (WHERE rag_status = 'green')::int AS green,
              COUNT(*) FILTER (WHERE rag_status = 'amber')::int AS amber,
              COUNT(*) FILTER (WHERE rag_status = 'red')::int   AS red
         FROM ee.projects WHERE is_active`,
    );

    const centres = await q<{ name: string; target: number; mtd: number; violations: number }>(
      `SELECT ec.name,
              COALESCE(ec.target_monthly, 0)::float8 AS target,
              COALESCE(SUM(s.net_amount), 0)::float8 AS mtd,
              COUNT(s.id) FILTER (WHERE s.discount_communicated_before_approval)::int AS violations
         FROM eh.experience_centres ec
         LEFT JOIN eh.sales s
           ON s.ec_id = ec.id AND s.sale_date >= date_trunc('month', CURRENT_DATE)::date
        GROUP BY ec.id, ec.name, ec.target_monthly
        ORDER BY ec.name`,
    );

    const day = now.getDate();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

    return {
      numbers: [wioNumber(wios), pioNumber(pios), stockNumber(), arNumber(invoices)],
      health: [
        eeHealth(rag ?? { green: 0, amber: 0, red: 0 }),
        factoryHealth(pios),
        ...centres.map((c) => centreHealth(c, day, daysInMonth)),
      ],
      invoices: agedInvoices(invoices),
    };
  });
}
