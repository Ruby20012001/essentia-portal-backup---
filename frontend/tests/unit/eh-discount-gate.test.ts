import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * S6 · EH discount control gate (Brief §28 · Velocity Gate 5).
 *
 * SCOPE OF THIS FILE. The module is DB-backed, so these are unit tests of the
 * TypeScript contract: which refusals fire and with exactly what wording, that
 * approval is a compare-and-swap, that the audit records the breach, and that
 * approving never rewrites the fact a discount was communicated early
 * (ADR-HS-01). Row visibility itself lives in RLS and is proven against real
 * PostgreSQL in db/validate.mjs ("RLS grants the Country Head their own centre").
 */

const { queryMock, auditMock, requirePermissionMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  auditMock: vi.fn(),
  requirePermissionMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  // withUserContext hands the service a query fn; route it to the same mock.
  withUserContext: async (_user: unknown, fn: (q: unknown) => unknown) => fn(queryMock),
}));
vi.mock("@/lib/services/audit", () => ({ writeAudit: auditMock }));
vi.mock("@/lib/services/permissions", () => ({ requirePermission: requirePermissionMock }));

import { approveDiscount } from "@/lib/services/eh";
import { BlockingRuleError, NotFoundError } from "@/lib/services/blocking";

type Row = Record<string, unknown>;
type Handler = { match: RegExp; rows: Row[] | ((params: unknown[]) => Row[]) };

function routes(...handlers: Handler[]) {
  queryMock.mockImplementation(async (sql: string, params: unknown[] = []) => {
    for (const h of handlers) {
      if (h.match.test(sql)) return typeof h.rows === "function" ? h.rows(params) : h.rows;
    }
    return [];
  });
}

const head = {
  id: "00000000-0000-4000-8000-000000000006",
  name: "Dev Country Head",
  accessLevel: "L2" as const,
  departmentId: null,
};

const SALE_ID = "00000000-0000-4000-8000-00000000b001";

/** A sale as the SELECT returns it, with per-centre threshold attached. */
function sale(over: Partial<Row> = {}): Row {
  return {
    id: SALE_ID,
    ec_id: "00000000-0000-4000-8000-00000000e001",
    discount_pct: "18.00",
    discount_approved_at: null,
    threshold: "10.00",
    ...over,
  };
}

/** The UPDATE ... RETURNING shape. */
function updated(over: Partial<Row> = {}): Row {
  return {
    id: SALE_ID,
    invoice_number: "EH/GGN/26-27/0181",
    sale_date: "2026-07-30",
    advisor: null,
    family: null,
    gross_amount: "420000.00",
    net_amount: "344400.00",
    discount_pct: "18.00",
    approved_by: null,
    approved_at: "2026-07-30T10:00:00.000Z",
    communicated_before_approval: false,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  requirePermissionMock.mockResolvedValue({ allowed: true, scope: "own_records" });
});

describe("approveDiscount — the gate's refusals are loud and exact", () => {
  it("requires approve on eh_sales before touching a row", async () => {
    requirePermissionMock.mockRejectedValueOnce(new Error("denied"));
    routes({ match: /FROM eh\.sales/, rows: [sale()] });

    await expect(approveDiscount(head, SALE_ID)).rejects.toThrow("denied");
    expect(requirePermissionMock).toHaveBeenCalledWith(head, "approve", "eh_sales");
    // The permission check must gate the read, not follow it.
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("refuses a sale that is not visible, without leaking whether it exists", async () => {
    routes({ match: /FROM eh\.sales/, rows: [] });

    await expect(approveDiscount(head, SALE_ID)).rejects.toBeInstanceOf(NotFoundError);
    await expect(approveDiscount(head, SALE_ID)).rejects.toThrow(
      /doesn't exist, or it isn't at a centre you hold/,
    );
  });

  it("refuses when there is no discount to approve", async () => {
    routes({ match: /FROM eh\.sales/, rows: [sale({ discount_pct: "0.00" })] });

    await expect(approveDiscount(head, SALE_ID)).rejects.toBeInstanceOf(BlockingRuleError);
    await expect(approveDiscount(head, SALE_ID)).rejects.toThrow(
      "This sale carries no discount — there is nothing to approve.",
    );
  });

  it("refuses below the centre's threshold, naming both numbers", async () => {
    routes({ match: /FROM eh\.sales/, rows: [sale({ discount_pct: "5.00", threshold: "10.00" })] });

    await expect(approveDiscount(head, SALE_ID)).rejects.toThrow(
      "A 5% discount is below this centre's 10% approval threshold. It does not need your sign-off.",
    );
  });

  it("reads the threshold from the centre, so a retuned centre changes the gate", async () => {
    // Same 12% discount: mandatory at Gurugram (10%), not at Mumbai (15%).
    routes({ match: /FROM eh\.sales/, rows: [sale({ discount_pct: "12.00", threshold: "15.00" })] });
    await expect(approveDiscount(head, SALE_ID)).rejects.toThrow(/below this centre's 15% approval threshold/);

    routes(
      { match: /UPDATE eh\.sales/, rows: [updated({ discount_pct: "12.00" })] },
      { match: /FROM eh\.sales/, rows: [sale({ discount_pct: "12.00", threshold: "10.00" })] },
    );
    await expect(approveDiscount(head, SALE_ID)).resolves.toMatchObject({ discountPct: 12 });
  });

  it("refuses a discount already approved", async () => {
    routes({
      match: /FROM eh\.sales/,
      rows: [sale({ discount_approved_at: "2026-07-29T09:00:00.000Z" })],
    });

    await expect(approveDiscount(head, SALE_ID)).rejects.toThrow("That discount is already approved.");
  });

  it("loses the race honestly when a second head approves first", async () => {
    // The guarded UPDATE returns no row — someone won the compare-and-swap.
    routes(
      { match: /UPDATE eh\.sales/, rows: [] },
      { match: /FROM eh\.sales/, rows: [sale()] },
    );

    await expect(approveDiscount(head, SALE_ID)).rejects.toThrow(
      "That discount was approved by someone else a moment ago.",
    );
    expect(auditMock).not.toHaveBeenCalled();
  });
});

describe("approveDiscount — the happy path and the record it leaves", () => {
  it("approves, and stamps the approver via the guarded UPDATE", async () => {
    routes(
      { match: /UPDATE eh\.sales/, rows: [updated()] },
      { match: /FROM eh\.sales/, rows: [sale()] },
    );

    const row = await approveDiscount(head, SALE_ID);

    expect(row).toMatchObject({ id: SALE_ID, discountPct: 18, netAmount: 344400 });
    expect(row.approvedAt).toBeTruthy();

    const update = queryMock.mock.calls.map((c) => String(c[0])).find((s) => /UPDATE eh\.sales/.test(s))!;
    // Only an unapproved row may be taken — this is the compare-and-swap.
    expect(update).toMatch(/discount_approved_at IS NULL/);
    // The approver is the session user, never a value passed in by the caller.
    expect(update).toMatch(/current_setting\('app\.user_id'/);
  });

  it("audits the approval, carrying whether it was already communicated", async () => {
    routes(
      { match: /UPDATE eh\.sales/, rows: [updated({ communicated_before_approval: true })] },
      { match: /FROM eh\.sales/, rows: [sale()] },
    );

    await approveDiscount(head, SALE_ID);

    expect(auditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: head.id,
        role: "L2",
        action: "EH_DISCOUNT_APPROVED",
        resourceType: "eh_sales",
        resourceId: SALE_ID,
        newValues: expect.objectContaining({ discountPct: 18, communicatedBeforeApproval: true }),
      }),
    );
  });

  it("does not rewrite history: approving keeps the early-communication flag (ADR-HS-01)", async () => {
    routes(
      { match: /UPDATE eh\.sales/, rows: [updated({ communicated_before_approval: true })] },
      { match: /FROM eh\.sales/, rows: [sale()] },
    );

    const row = await approveDiscount(head, SALE_ID);

    expect(row.communicatedBeforeApproval).toBe(true);
    // Nothing in the write may clear the breach flag.
    const update = queryMock.mock.calls.map((c) => String(c[0])).find((s) => /UPDATE eh\.sales/.test(s))!;
    expect(update).not.toMatch(/discount_communicated_before_approval\s*=/);
  });
});
