import { withUserContext } from "@/lib/db";
import { writeAudit } from "@/lib/services/audit";
import { requirePermission } from "@/lib/services/permissions";
import { BlockingRuleError, NotFoundError } from "@/lib/services/blocking";
import type { SessionUser } from "@/lib/auth/session";

/**
 * S6 · essentia home — Experience Centre (Brief §28 · Velocity Gate 5).
 *
 * The gate: a Client Advisor may not communicate a discount to a family until
 * the Country Head has approved it. `eh.sales` carries the whole contract from
 * db/001 — discount_pct, discount_approved_by/at, and
 * discount_communicated_before_approval, which records a breach rather than
 * preventing one. The threshold at which approval becomes mandatory is
 * per-centre configuration (db/029), never hard-coded (ADR-EP-01).
 *
 * Rows are RLS-scoped: L0/L1 see every centre; a Country Head sees the centre
 * they own (db/029 eh_sales_country_head). Everyone else reads nothing, which
 * is why the page checks `read` on eh_sales before rendering.
 */

export type EcOption = { id: string; code: string; name: string; city: string | null };

export type DiscountRow = {
  id: string;
  invoiceNumber: string | null;
  saleDate: string;
  advisor: string | null;
  family: string | null;
  grossAmount: number;
  netAmount: number;
  discountPct: number;
  approvedBy: string | null;
  approvedAt: string | null;
  /** TRUE = the discount reached the family before sign-off. A logged breach. */
  communicatedBeforeApproval: boolean;
  /** Below the centre's threshold this sale never needed approval. */
  needsApproval: boolean;
};

export type CentreTarget = {
  id: string;
  name: string;
  city: string | null;
  monthToDate: number;
  target: number;
  pctOfTarget: number;
};

export type ExperienceCentre = {
  centre: { id: string; code: string; name: string; city: string | null; thresholdPct: number };
  summary: {
    monthToDate: number;
    target: number;
    pctOfTarget: number;
    todaySales: number;
    todayTransactions: number;
    todayFamilies: number;
    pendingApprovals: number;
    violations: number;
    checklistComplete: boolean;
    checklistDone: number;
    checklistTotal: number;
    checklistAt: string | null;
  };
  targets: CentreTarget[];
  pending: DiscountRow[];
  settled: DiscountRow[];
};

type SaleRow = {
  id: string;
  invoice_number: string | null;
  sale_date: string;
  advisor: string | null;
  family: string | null;
  gross_amount: string | null;
  net_amount: string | null;
  discount_pct: string | null;
  approved_by: string | null;
  approved_at: string | null;
  communicated_before_approval: boolean;
};

function toRow(r: SaleRow, thresholdPct: number): DiscountRow {
  const discountPct = Number(r.discount_pct ?? 0);
  return {
    id: r.id,
    invoiceNumber: r.invoice_number,
    saleDate: r.sale_date,
    advisor: r.advisor,
    family: r.family,
    grossAmount: Number(r.gross_amount ?? 0),
    netAmount: Number(r.net_amount ?? 0),
    discountPct,
    approvedBy: r.approved_by,
    approvedAt: r.approved_at,
    communicatedBeforeApproval: r.communicated_before_approval,
    needsApproval: discountPct > 0 && discountPct >= thresholdPct,
  };
}

/** Centres visible to this user, so the switcher only ever offers real options. */
export async function listCentreOptions(user: SessionUser): Promise<EcOption[]> {
  return withUserContext(user, async (q) => {
    const rows = await q<{ id: string; code: string; name: string; city: string | null }>(
      `SELECT ec.id, ec.code::text AS code, ec.name, ec.city
         FROM eh.experience_centres ec
        WHERE current_setting('app.user_access_level', TRUE) IN ('L0','L1')
           OR ec.country_head_id = current_setting('app.user_id', TRUE)::UUID
        ORDER BY ec.name`,
    );
    return rows;
  });
}

export async function getExperienceCentre(user: SessionUser, ecId: string): Promise<ExperienceCentre | null> {
  return withUserContext(user, async (q) => {
    const [ec] = await q<{
      id: string;
      code: string;
      name: string;
      city: string | null;
      target_monthly: string | null;
      discount_threshold_pct: string | null;
    }>(
      `SELECT id, code::text AS code, name, city, target_monthly, discount_threshold_pct
         FROM eh.experience_centres WHERE id = $1`,
      [ecId],
    );
    if (!ec) return null;

    const thresholdPct = Number(ec.discount_threshold_pct ?? 0);

    const saleRows = await q<SaleRow>(
      `SELECT s.id, s.invoice_number, s.sale_date::text AS sale_date,
              ca.full_name  AS advisor,
              f.primary_contact AS family,
              s.gross_amount, s.net_amount, s.discount_pct,
              ap.full_name  AS approved_by,
              s.discount_approved_at::text AS approved_at,
              s.discount_communicated_before_approval AS communicated_before_approval
         FROM eh.sales s
         LEFT JOIN public.users ca ON ca.id = s.ca_id
         LEFT JOIN public.users ap ON ap.id = s.discount_approved_by
         LEFT JOIN public.families f ON f.id = s.family_id
        WHERE s.ec_id = $1
          AND s.sale_date >= date_trunc('month', CURRENT_DATE)::date
        ORDER BY s.sale_date DESC, s.invoice_number DESC`,
      [ecId],
    );

    const sales = saleRows.map((r) => toRow(r, thresholdPct));

    const today = new Date().toISOString().slice(0, 10);
    const todays = sales.filter((s) => s.saleDate.slice(0, 10) === today);

    // Awaiting sign-off: discounted at or above the centre's threshold, unapproved.
    const pending = sales.filter((s) => s.needsApproval && !s.approvedAt);
    const settled = sales.filter((s) => !s.needsApproval || s.approvedAt);

    const monthToDate = sales.reduce((n, s) => n + s.netAmount, 0);
    const target = Number(ec.target_monthly ?? 0);

    // The tracker lists ONLY centres whose sales this viewer can actually
    // read. eh.experience_centres is not RLS-fenced but eh.sales is, so an
    // unfiltered roll-up would render a real target beside a ₹0 that means
    // "invisible to you", not "sold nothing" — a number the screen cannot
    // stand behind (ADR-HS-01). Leadership sees all three; a Country Head
    // sees the one they hold. Same rule as listCentreOptions.
    const targetRows = await q<{ id: string; name: string; city: string | null; target_monthly: string | null; mtd: string | null }>(
      `SELECT ec.id, ec.name, ec.city, ec.target_monthly,
              COALESCE(SUM(s.net_amount) FILTER (
                WHERE s.sale_date >= date_trunc('month', CURRENT_DATE)::date
              ), 0) AS mtd
         FROM eh.experience_centres ec
         LEFT JOIN eh.sales s ON s.ec_id = ec.id
        WHERE current_setting('app.user_access_level', TRUE) IN ('L0','L1')
           OR ec.country_head_id = current_setting('app.user_id', TRUE)::UUID
        GROUP BY ec.id, ec.name, ec.city, ec.target_monthly
        ORDER BY ec.name`,
    );

    const [chk] = await q<{ all_complete: boolean; items: unknown; created_at: string | null }>(
      `SELECT all_complete, items, created_at::text AS created_at
         FROM eh.daily_checklist
        WHERE ec_id = $1 AND check_date = CURRENT_DATE`,
      [ecId],
    );

    const items = Array.isArray(chk?.items) ? (chk!.items as { complete?: boolean }[]) : [];

    return {
      centre: { id: ec.id, code: ec.code, name: ec.name, city: ec.city, thresholdPct },
      summary: {
        monthToDate,
        target,
        pctOfTarget: target > 0 ? Math.round((monthToDate / target) * 100) : 0,
        todaySales: todays.reduce((n, s) => n + s.netAmount, 0),
        todayTransactions: todays.length,
        todayFamilies: new Set(todays.map((s) => s.family).filter(Boolean)).size,
        pendingApprovals: pending.length,
        violations: sales.filter((s) => s.communicatedBeforeApproval).length,
        checklistComplete: chk?.all_complete ?? false,
        checklistDone: items.filter((i) => i?.complete).length,
        checklistTotal: items.length,
        checklistAt: chk?.created_at ?? null,
      },
      targets: targetRows.map((t) => {
        const mtd = Number(t.mtd ?? 0);
        const tgt = Number(t.target_monthly ?? 0);
        return {
          id: t.id,
          name: t.name,
          city: t.city,
          monthToDate: mtd,
          target: tgt,
          pctOfTarget: tgt > 0 ? Math.round((mtd / tgt) * 100) : 0,
        };
      }),
      pending,
      settled,
    };
  });
}

/**
 * Approve one discount. The Country Head's sign-off — the act Velocity Gate 5
 * exists to force. Refusals are loud and exact (BlockingRuleError → 422), never
 * silent: the caller is told precisely why.
 *
 * Approving does NOT clear an existing breach flag. If the discount already
 * reached the family, that happened, and the record keeps saying so
 * (ADR-HS-01) — approval settles the price, it does not rewrite history.
 */
export async function approveDiscount(user: SessionUser, saleId: string): Promise<DiscountRow> {
  await requirePermission(user, "approve", "eh_sales");

  const updated = await withUserContext(user, async (q) => {
    const [sale] = await q<{
      id: string;
      ec_id: string;
      discount_pct: string | null;
      discount_approved_at: string | null;
      threshold: string | null;
    }>(
      `SELECT s.id, s.ec_id, s.discount_pct, s.discount_approved_at::text AS discount_approved_at,
              ec.discount_threshold_pct AS threshold
         FROM eh.sales s
         JOIN eh.experience_centres ec ON ec.id = s.ec_id
        WHERE s.id = $1`,
      [saleId],
    );
    if (!sale) throw new NotFoundError("That sale doesn't exist, or it isn't at a centre you hold.");

    const pct = Number(sale.discount_pct ?? 0);
    const threshold = Number(sale.threshold ?? 0);

    if (pct <= 0) {
      throw new BlockingRuleError("This sale carries no discount — there is nothing to approve.");
    }
    if (pct < threshold) {
      throw new BlockingRuleError(
        `A ${pct}% discount is below this centre's ${threshold}% approval threshold. It does not need your sign-off.`,
      );
    }
    if (sale.discount_approved_at) {
      throw new BlockingRuleError("That discount is already approved.");
    }

    const [row] = await q<SaleRow>(
      `UPDATE eh.sales s
          SET discount_approved_by = current_setting('app.user_id', TRUE)::UUID,
              discount_approved_at = NOW()
        WHERE s.id = $1 AND s.discount_approved_at IS NULL
        RETURNING s.id, s.invoice_number, s.sale_date::text AS sale_date,
                  NULL::text AS advisor, NULL::text AS family,
                  s.gross_amount, s.net_amount, s.discount_pct,
                  NULL::text AS approved_by,
                  s.discount_approved_at::text AS approved_at,
                  s.discount_communicated_before_approval AS communicated_before_approval`,
      [saleId],
    );
    // Compare-and-swap: a second approver arriving at the same moment loses.
    if (!row) throw new BlockingRuleError("That discount was approved by someone else a moment ago.");

    return toRow(row, threshold);
  });

  await writeAudit({
    userId: user.id,
    role: user.accessLevel,
    action: "EH_DISCOUNT_APPROVED",
    resourceType: "eh_sales",
    resourceId: saleId,
    newValues: {
      discountPct: updated.discountPct,
      // Recorded on the approval itself: this one had already been communicated.
      communicatedBeforeApproval: updated.communicatedBeforeApproval,
    },
  });

  return updated;
}
