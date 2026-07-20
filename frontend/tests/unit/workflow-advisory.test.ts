import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Workflow AI advisory (WES §13 / ADR-013) — Phase 4 Steps 9–10.
 *
 * The load-bearing invariant is a SAFETY one: the advisory is STRICTLY
 * read-only. It must never approve, reject, delegate or mutate workflow state,
 * and an AI outage must degrade to "unavailable" rather than block an approver.
 * These tests pin that contract, plus the deterministic SLA risk model.
 */

const { queryMock, aiMock, auditMock, requirePermissionMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  aiMock: vi.fn(),
  auditMock: vi.fn(),
  requirePermissionMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ query: queryMock }));
vi.mock("@/lib/ai", () => ({ aiCompleteFromPrompt: aiMock }));
vi.mock("@/lib/services/audit", () => ({ writeAudit: auditMock }));
vi.mock("@/lib/services/permissions", () => ({ requirePermission: requirePermissionMock }));

import { computeSlaRisk, getWorkflowAdvisory } from "@/lib/services/workflow-advisory";
import { NotFoundError } from "@/lib/services/blocking";

/** Deterministic SLA-breach risk (pure — the AI part is advisory + DB-backed). */
describe("computeSlaRisk", () => {
  const now = new Date("2026-07-09T12:00:00Z");

  it("no deadlines → 'none'", () => {
    expect(computeSlaRisk(now, [null, null]).level).toBe("none");
  });

  it("a past deadline → 'breached'", () => {
    const r = computeSlaRisk(now, ["2026-07-09T10:00:00Z", "2026-07-10T00:00:00Z"]);
    expect(r.level).toBe("breached");
    expect(r.breachedCount).toBe(1);
  });

  it("< 12h remaining → 'high'", () => {
    expect(computeSlaRisk(now, ["2026-07-09T18:00:00Z"]).level).toBe("high");
  });

  it("12–24h remaining → 'medium'", () => {
    expect(computeSlaRisk(now, ["2026-07-10T08:00:00Z"]).level).toBe("medium");
  });

  it("> 24h remaining → 'ok', hours reported from the earliest deadline", () => {
    const r = computeSlaRisk(now, ["2026-07-11T12:00:00Z", "2026-07-12T12:00:00Z"]);
    expect(r.level).toBe("ok");
    expect(r.hoursRemaining).toBe(48);
  });
});

/* ── getWorkflowAdvisory — the ADR-013 safety contract ──────────────────── */

type Row = Record<string, unknown>;
type Handler = { match: RegExp; rows: Row[] };

function routes(...handlers: Handler[]) {
  queryMock.mockImplementation(async (sql: string) => {
    for (const h of handlers) if (h.match.test(sql)) return h.rows;
    return [];
  });
}

const SQL = {
  instance: /FROM portal\.workflow_instances i/,
  tasks: /SELECT sla_due_at::text FROM portal\.workflow_tasks/,
};

const user = { id: "u-1", name: "Approver", accessLevel: "L1" as const, departmentId: null };

const instance = (over: Row = {}): Row => ({
  workflow_code: "pio_approval",
  workflow_name: "PIO approval",
  resource_type: "pio",
  resource_id: "pio-1",
  resource_ref: "PIO ED/26-27/058",
  status: "pending",
  current_step: 1,
  context: {},
  ...over,
});

const ok = (...extra: Handler[]) => routes({ match: SQL.instance, rows: [instance()] }, ...extra);

beforeEach(() => {
  vi.clearAllMocks();
  requirePermissionMock.mockResolvedValue({ allowed: true, scope: "all", source: "global" });
  aiMock.mockResolvedValue({ text: "Nothing anomalous.", provider: "anthropic", model: "claude-sonnet-4-6" });
});

describe("getWorkflowAdvisory — STRICTLY advisory (ADR-013)", () => {
  it("NEVER writes to the workflow: no approve/reject/delegate, no state mutation", async () => {
    ok();

    await getWorkflowAdvisory(user, "inst-1");

    // Every statement issued must be a read.
    for (const [sql] of queryMock.mock.calls) {
      expect(String(sql)).not.toMatch(/\b(INSERT|UPDATE|DELETE)\b/i);
    }
  });

  it("is permission-gated on read:workflows", async () => {
    ok();

    await getWorkflowAdvisory(user, "inst-1");

    expect(requirePermissionMock).toHaveBeenCalledWith(user, "read", "workflows");
  });

  it("a permission denial refuses the advisory outright", async () => {
    requirePermissionMock.mockRejectedValueOnce(new Error("denied"));

    await expect(getWorkflowAdvisory(user, "inst-1")).rejects.toThrow(/denied/);
    expect(aiMock).not.toHaveBeenCalled();
  });

  it("an unknown instance is a NotFound, not a fabricated advisory", async () => {
    routes({ match: SQL.instance, rows: [] });

    await expect(getWorkflowAdvisory(user, "nope")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("carries the disclaimer that the approver decides", async () => {
    ok();

    const a = await getWorkflowAdvisory(user, "inst-1");

    expect(a.disclaimer).toMatch(/advisory only/i);
    expect(a.disclaimer).toMatch(/never approves|approver decides/i);
  });
});

describe("getWorkflowAdvisory — AI degrades gracefully, never blocks", () => {
  it("an AI outage returns unavailable WITH the reason, and still returns the SLA read", async () => {
    ok({ match: SQL.tasks, rows: [{ sla_due_at: null }] });
    aiMock.mockRejectedValueOnce(new Error("ANTHROPIC_API_KEY is not set"));

    const a = await getWorkflowAdvisory(user, "inst-1");

    expect(a.ai.available).toBe(false);
    if (!a.ai.available) expect(a.ai.reason).toMatch(/ANTHROPIC_API_KEY/);
    // The deterministic half still works — the advisory is not all-or-nothing.
    expect(a.slaRisk).toBeDefined();
    expect(a.status).toBe("pending");
  });

  it("reports the provider and model when the AI answers", async () => {
    ok();

    const a = await getWorkflowAdvisory(user, "inst-1");

    expect(a.ai.available).toBe(true);
    if (a.ai.available) {
      expect(a.ai.summary).toBe("Nothing anomalous.");
      expect(a.ai.model).toBe("claude-sonnet-4-6");
    }
  });

  it("an AI failure is still audited — the call is never invisible", async () => {
    ok();
    aiMock.mockRejectedValueOnce(new Error("provider down"));

    await getWorkflowAdvisory(user, "inst-1");

    expect(auditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "WORKFLOW_ADVISORY",
        newValues: expect.objectContaining({ aiAvailable: false }),
      }),
    );
  });

  it("feeds the AI the friendly document ref, not a raw UUID", async () => {
    ok();

    const a = await getWorkflowAdvisory(user, "inst-1");

    expect(a.resourceRef).toBe("PIO ED/26-27/058");
    expect(aiMock).toHaveBeenCalledWith(user, "workflow_advisory", expect.objectContaining({ resourceRef: "PIO ED/26-27/058" }));
  });

  it("falls back to type+id when no friendly ref resolves", async () => {
    routes({ match: SQL.instance, rows: [instance({ resource_ref: null })] });

    const a = await getWorkflowAdvisory(user, "inst-1");

    expect(a.resourceRef).toBe("pio pio-1");
  });
});
