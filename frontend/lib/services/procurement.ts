import { withUserContext } from "@/lib/db";
import type { SessionUser } from "@/lib/auth/session";
import type { PoRow, VendorRow, WoRow } from "@/lib/services/procurement-logic";

/**
 * S9 · Procurement (Brief §33) — VRNs, work orders, purchase orders and the
 * deliveries a GRN is due on. Read-only.
 *
 * proc.vendors also holds PAN, Aadhaar and bank details. None of those
 * columns is selected here: this screen never needs them, so they never
 * leave the database through it.
 */

export type Procurement = {
  /** CURRENT_DATE as the database sees it, so every date rule uses one clock. */
  today: string;
  vendors: VendorRow[];
  recentWos: WoRow[];
  wosThisMonth: { count: number; total: number };
  pos: PoRow[];
};

/** Procurement's own department may read it as well as leadership; other HODs may not. */
export async function isProcurementDept(user: SessionUser): Promise<boolean> {
  if (!user.departmentId) return false;
  return withUserContext(user, async (q) => {
    const [row] = await q<{ code: string }>(`SELECT code FROM public.departments WHERE id = $1`, [
      user.departmentId,
    ]);
    return row?.code === "PROC";
  });
}

export async function getProcurement(user: SessionUser): Promise<Procurement> {
  return withUserContext(user, async (q) => {
    const [{ today }] = await q<{ today: string }>(`SELECT CURRENT_DATE::text AS today`);

    const vendors = await q<VendorRow>(
      `SELECT v.id, v.vrn_number AS vrn, v.company_name AS company, v.vendor_type AS type,
              v.vrn_status AS status, v.vrn_expiry_date::text AS expiry,
              v.performance_score::float8 AS score, COALESCE(v.is_preferred, FALSE) AS preferred,
              COUNT(w.id) FILTER (
                WHERE w.status IN ('draft','pending_approval','approved') AND w.actual_complete IS NULL
              )::int AS "openWos"
         FROM proc.vendors v
         LEFT JOIN proc.work_orders w ON w.vendor_id = v.id
        GROUP BY v.id`,
    );

    const recentWos = await q<WoRow>(
      `SELECT w.wo_number AS "woNumber", v.company_name AS vendor, p.project_name AS project,
              w.trade_category AS trade, w.wo_value::float8 AS value,
              COALESCE(w.coordination_charge_pct, 0)::float8 AS "coordPct",
              COALESCE(w.coordination_charge_amt, 0)::float8 AS "coordAmt",
              w.total_value::float8 AS total, w.status::text AS status
         FROM proc.work_orders w
         JOIN proc.vendors v ON v.id = w.vendor_id
         LEFT JOIN ee.projects p ON p.id = w.project_id
        ORDER BY w.order_date DESC, w.created_at DESC
        LIMIT 12`,
    );

    const [month] = await q<{ count: number; total: number }>(
      `SELECT COUNT(*)::int AS count, COALESCE(SUM(total_value), 0)::float8 AS total
         FROM proc.work_orders
        WHERE order_date >= date_trunc('month', CURRENT_DATE)::date
          AND status <> 'rejected'`,
    );

    const pos = await q<PoRow>(
      `SELECT po.id, po.po_number AS "poNumber", v.company_name AS vendor, p.project_name AS project,
              po.total_amount::float8 AS total,
              COALESCE(po.three_quotes_satisfied, FALSE) AS "quotesSatisfied",
              COALESCE(po.three_quotes_waived, FALSE) AS "quotesWaived",
              po.status::text AS status,
              po.expected_delivery::text AS "expectedDelivery",
              (po.actual_delivery IS NOT NULL) AS delivered
         FROM proc.purchase_orders po
         JOIN proc.vendors v ON v.id = po.vendor_id
         LEFT JOIN ee.projects p ON p.id = po.project_id
        WHERE po.status IN ('draft','pending_approval','approved')
          AND po.actual_delivery IS NULL
        ORDER BY po.expected_delivery NULLS LAST, po.created_at`,
    );

    return { today, vendors, recentWos, wosThisMonth: month ?? { count: 0, total: 0 }, pos };
  });
}
