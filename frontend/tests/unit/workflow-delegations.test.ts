import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Delegation engine (WES §9) — Phase 4 Step 6.
 *
 * SCOPE OF THIS FILE. The delegation module is DB-backed, so these are unit
 * tests of the TypeScript contract: chain traversal and termination, the MUST
 * rules and the errors they raise, audit payloads, and event routing. The data
 * layer is mocked, so predicates that live in SQL (the from/to date window, the
 * is_active join, the CHECK constraints) are asserted at the TS boundary here —
 * "the DB reports no active delegation → the engine treats the user as
 * undelegated" — and proven against real PostgreSQL in db/validate.mjs.
 * End-to-end delegate-approves / original-blocked is proven in the harness and
 * a live drive, because resolveActingTask is private to the workflow engine.
 */

const { queryMock, auditMock, publishMock, requirePermissionMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  auditMock: vi.fn(),
  publishMock: vi.fn(),
  requirePermissionMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ query: queryMock }));
vi.mock("@/lib/services/audit", () => ({ writeAudit: auditMock }));
vi.mock("@/lib/notifications", () => ({ publishEvent: publishMock }));
vi.mock("@/lib/services/permissions", () => ({ requirePermission: requirePermissionMock }));

import {
  createDelegation,
  delegateTask,
  expireStandingDelegations,
  listDelegations,
  resolveDelegateChain,
  revokeDelegation,
} from "@/lib/services/workflow-delegations";
import { BlockingRuleError, ConflictError, NotFoundError } from "@/lib/services/blocking";

type Row = Record<string, unknown>;
type Handler = { match: RegExp; rows: Row[] | ((params: unknown[]) => Row[]) };

/** Route a mocked query by its SQL text. Most specific matcher first. */
function routes(...handlers: Handler[]) {
  queryMock.mockImplementation(async (sql: string, params: unknown[] = []) => {
    for (const h of handlers) {
      if (h.match.test(sql)) return typeof h.rows === "function" ? h.rows(params) : h.rows;
    }
    return [];
  });
}

// SQL fingerprints of each statement the module issues.
const SQL = {
  resolveChain: /JOIN public\.users u ON u\.id = wd\.delegate_id AND u\.is_active/,
  listDelegations: /delegator_name/,
  cycleWalk: /SELECT delegate_id FROM portal\.workflow_delegations/,
  duplicateCheck: /IS NOT DISTINCT FROM/,
  insertDelegation: /INSERT INTO portal\.workflow_delegations/,
  activeUser: /SELECT full_name FROM public\.users/,
  revokeSelect: /SELECT delegator_id, delegate_id, revoked_at/,
  revokeUpdate: /UPDATE portal\.workflow_delegations SET revoked_at/,
  taskSelect: /FROM portal\.workflow_tasks t/,
  taskUpdate: /UPDATE portal\.workflow_tasks SET delegated_to_user_id/,
  expirySweep: /SET expired_at = NOW\(\)/,
};

const MANAGER = "11111111-1111-4111-8111-111111111111";
const LEAD = "22222222-2222-4222-8222-222222222222";
const THIRD = "33333333-3333-4333-8333-333333333333";

const manager = { id: MANAGER, name: "Manager", accessLevel: "L2" as const, departmentId: null };
const activeUser = (name: string): Handler => ({ match: SQL.activeUser, rows: [{ full_name: name }] });
const noCycle: Handler = { match: SQL.cycleWalk, rows: [] };

beforeEach(() => {
  vi.clearAllMocks();
  requirePermissionMock.mockResolvedValue({ allowed: true, scope: "all", source: "global" });
});

/* ── 1. Standing delegation ─────────────────────────────────────────────── */
describe("standing delegation — resolveDelegateChain", () => {
  it("resolves the delegate as the effective approver, preserving the original", async () => {
    routes({ match: SQL.resolveChain, rows: (p) => (p[0] === MANAGER ? [{ delegate_id: LEAD }] : []) });

    const r = await resolveDelegateChain(MANAGER, "pio_approval");

    expect(r).toEqual({ effective: LEAD, original: MANAGER, delegated: true });
  });

  it("follows a multi-hop chain to the final delegate", async () => {
    const hop: Record<string, string> = { [MANAGER]: LEAD, [LEAD]: THIRD };
    routes({ match: SQL.resolveChain, rows: (p) => (hop[p[0] as string] ? [{ delegate_id: hop[p[0] as string] }] : []) });

    expect(await resolveDelegateChain(MANAGER, "pio_approval")).toEqual({
      effective: THIRD,
      original: MANAGER,
      delegated: true,
    });
  });

  it("passes the definition_code so a scoped delegation can be resolved", async () => {
    routes({ match: SQL.resolveChain, rows: [] });

    await resolveDelegateChain(MANAGER, "pio_approval");

    expect(queryMock).toHaveBeenCalledWith(expect.stringMatching(SQL.resolveChain), [MANAGER, "pio_approval"]);
  });
});

/* ── 5/6. Expired + inactive delegations ────────────────────────────────── */
describe("expired and inactive delegations", () => {
  it("no active delegation (expired window / revoked / inactive delegate is filtered in SQL) → user is undelegated", async () => {
    routes({ match: SQL.resolveChain, rows: [] });

    expect(await resolveDelegateChain(MANAGER, "pio_approval")).toEqual({
      effective: MANAGER,
      original: MANAGER,
      delegated: false,
    });
  });

  it("createDelegation rejects an inactive delegate", async () => {
    routes({ match: SQL.activeUser, rows: (p) => (p[0] === LEAD ? [] : [{ full_name: "Manager" }]) });

    await expect(
      createDelegation(manager, { delegateId: LEAD, fromDate: "2026-07-01", toDate: "2026-07-10" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("createDelegation rejects an inactive delegator", async () => {
    routes({ match: SQL.activeUser, rows: (p) => (p[0] === MANAGER ? [] : [{ full_name: "Lead" }]) });

    await expect(
      createDelegation(manager, { delegateId: LEAD, fromDate: "2026-07-01", toDate: "2026-07-10" }),
    ).rejects.toThrow(/delegator is not an active user/);
  });

  it("rejects an inverted window (from after to)", async () => {
    routes(activeUser("Lead"));

    await expect(
      createDelegation(manager, { delegateId: LEAD, fromDate: "2026-07-10", toDate: "2026-07-01" }),
    ).rejects.toBeInstanceOf(BlockingRuleError);
  });

  it("an expired delegation does not block a new one (duplicate check returns nothing)", async () => {
    routes(
      activeUser("Lead"),
      { match: SQL.duplicateCheck, rows: [] },
      noCycle,
      { match: SQL.insertDelegation, rows: [{ id: "new-delegation" }] },
    );

    await expect(
      createDelegation(manager, { delegateId: LEAD, fromDate: "2026-07-01", toDate: "2026-07-10" }),
    ).resolves.toEqual({ id: "new-delegation" });
  });
});

/* ── 3. Self-delegation ─────────────────────────────────────────────────── */
describe("self-delegation is rejected", () => {
  it("createDelegation: delegating to yourself", async () => {
    routes(activeUser("Manager"));

    await expect(
      createDelegation(manager, { delegateId: MANAGER, fromDate: "2026-07-01", toDate: "2026-07-10" }),
    ).rejects.toThrow(/cannot delegate to themselves/);
    expect(queryMock).not.toHaveBeenCalledWith(expect.stringMatching(SQL.insertDelegation), expect.anything());
  });

  it("delegateTask: delegating a task to yourself", async () => {
    routes(activeUser("Manager"));

    await expect(delegateTask(manager, "instance-1", MANAGER)).rejects.toThrow(/cannot be delegated to yourself/);
  });
});

/* ── 4. Cycles + termination ────────────────────────────────────────────── */
describe("delegation cycles", () => {
  it("createDelegation refuses a delegation that would loop back (A→B where B→A)", async () => {
    routes(
      activeUser("Lead"),
      { match: SQL.duplicateCheck, rows: [] },
      { match: SQL.cycleWalk, rows: (p) => (p[0] === LEAD ? [{ delegate_id: MANAGER }] : []) },
    );

    await expect(
      createDelegation(manager, { delegateId: LEAD, fromDate: "2026-07-01", toDate: "2026-07-10" }),
    ).rejects.toThrow(/delegation loop/);
    expect(queryMock).not.toHaveBeenCalledWith(expect.stringMatching(SQL.insertDelegation), expect.anything());
  });

  it("createDelegation refuses a longer loop (A→B where B→C→A)", async () => {
    const hop: Record<string, string> = { [LEAD]: THIRD, [THIRD]: MANAGER };
    routes(
      activeUser("Lead"),
      { match: SQL.duplicateCheck, rows: [] },
      { match: SQL.cycleWalk, rows: (p) => (hop[p[0] as string] ? [{ delegate_id: hop[p[0] as string] }] : []) },
    );

    await expect(
      createDelegation(manager, { delegateId: LEAD, fromDate: "2026-07-01", toDate: "2026-07-10" }),
    ).rejects.toThrow(/delegation loop/);
  });

  it("resolveDelegateChain breaks an existing cycle instead of looping forever", async () => {
    const hop: Record<string, string> = { [MANAGER]: LEAD, [LEAD]: MANAGER };
    routes({ match: SQL.resolveChain, rows: (p) => [{ delegate_id: hop[p[0] as string] }] });

    const r = await resolveDelegateChain(MANAGER, "pio_approval");

    // Stops at the last unvisited hop rather than oscillating.
    expect(r.effective).toBe(LEAD);
    expect(queryMock).toHaveBeenCalledTimes(2);
  });

  it("resolveDelegateChain terminates on an unbounded chain (hop cap)", async () => {
    let n = 0;
    routes({ match: SQL.resolveChain, rows: () => [{ delegate_id: `user-${n++}` }] });

    const r = await resolveDelegateChain(MANAGER, "pio_approval");

    expect(r.delegated).toBe(true);
    expect(queryMock).toHaveBeenCalledTimes(16); // MAX_HOPS — never unbounded
  });
});

/* ── 7. Duplicate prevention ────────────────────────────────────────────── */
describe("duplicate delegation prevention", () => {
  it("refuses a second active delegation for the same scope", async () => {
    routes(activeUser("Lead"), { match: SQL.duplicateCheck, rows: [{ id: "existing" }] });

    await expect(
      createDelegation(manager, { delegateId: LEAD, fromDate: "2026-07-01", toDate: "2026-07-10" }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(queryMock).not.toHaveBeenCalledWith(expect.stringMatching(SQL.insertDelegation), expect.anything());
  });

  it("scopes the duplicate check to (delegator, definition_code)", async () => {
    routes(activeUser("Lead"), { match: SQL.duplicateCheck, rows: [] }, noCycle, {
      match: SQL.insertDelegation,
      rows: [{ id: "d1" }],
    });

    await createDelegation(manager, {
      delegateId: LEAD,
      fromDate: "2026-07-01",
      toDate: "2026-07-10",
      definitionCode: "pio_approval",
    });

    expect(queryMock).toHaveBeenCalledWith(expect.stringMatching(SQL.duplicateCheck), [MANAGER, "pio_approval"]);
  });
});

/* ── 2. Task-specific delegation ────────────────────────────────────────── */
describe("task-specific delegation", () => {
  const task = { id: "task-1", group_no: 2, resource_type: "pio", resource_id: "pio-1" };

  function taskRoutes() {
    routes(activeUser("Lead"), noCycle, { match: SQL.taskSelect, rows: [task] }, {
      match: SQL.taskUpdate,
      rows: [{ id: task.id }],
    });
  }

  it("sets the delegate as effective approver on that one task", async () => {
    taskRoutes();

    const r = await delegateTask(manager, "instance-1", LEAD, "on site");

    expect(r).toEqual({ taskId: "task-1", effectiveApprover: LEAD });
    // Only delegated_to_user_id is written — assignee_user_id (the original) is untouched.
    expect(queryMock).toHaveBeenCalledWith(expect.stringMatching(SQL.taskUpdate), ["task-1", LEAD]);
  });

  it("only the current effective approver may delegate the task", async () => {
    routes(activeUser("Lead"), { match: SQL.taskSelect, rows: [] });

    await expect(delegateTask(manager, "instance-1", LEAD)).rejects.toThrow(/no pending task to delegate/);
  });

  it("refuses when the task was actioned concurrently (CAS returns nothing)", async () => {
    routes(activeUser("Lead"), noCycle, { match: SQL.taskSelect, rows: [task] }, { match: SQL.taskUpdate, rows: [] });

    await expect(delegateTask(manager, "instance-1", LEAD)).rejects.toBeInstanceOf(ConflictError);
  });

  it("refuses a task delegation that would loop", async () => {
    routes(activeUser("Lead"), { match: SQL.taskSelect, rows: [task] }, {
      match: SQL.cycleWalk,
      rows: (p) => (p[0] === LEAD ? [{ delegate_id: MANAGER }] : []),
    });

    await expect(delegateTask(manager, "instance-1", LEAD)).rejects.toThrow(/delegation loop/);
  });
});

/* ── Authority: no broader permissions, no impersonation ────────────────── */
describe("authority", () => {
  it("delegating on someone else's behalf requires assign:workflows", async () => {
    routes(activeUser("Lead"), { match: SQL.duplicateCheck, rows: [] }, noCycle, {
      match: SQL.insertDelegation,
      rows: [{ id: "d1" }],
    });

    await createDelegation(manager, {
      delegatorId: THIRD,
      delegateId: LEAD,
      fromDate: "2026-07-01",
      toDate: "2026-07-10",
    });

    expect(requirePermissionMock).toHaveBeenCalledWith(manager, "assign", "workflows");
  });

  it("delegating your own approvals does not require elevated permission", async () => {
    routes(activeUser("Lead"), { match: SQL.duplicateCheck, rows: [] }, noCycle, {
      match: SQL.insertDelegation,
      rows: [{ id: "d1" }],
    });

    await createDelegation(manager, { delegateId: LEAD, fromDate: "2026-07-01", toDate: "2026-07-10" });

    expect(requirePermissionMock).not.toHaveBeenCalled();
  });

  it("revoking someone else's delegation requires assign:workflows", async () => {
    routes(
      { match: SQL.revokeSelect, rows: [{ delegator_id: THIRD, delegate_id: LEAD, revoked_at: null }] },
      { match: SQL.revokeUpdate, rows: [{ id: "d1" }] },
    );

    await revokeDelegation(manager, "d1");

    expect(requirePermissionMock).toHaveBeenCalledWith(manager, "assign", "workflows");
  });
});

/* ── Revocation ─────────────────────────────────────────────────────────── */
describe("revocation", () => {
  it("revokes an active delegation", async () => {
    routes(
      { match: SQL.revokeSelect, rows: [{ delegator_id: MANAGER, delegate_id: LEAD, revoked_at: null }] },
      { match: SQL.revokeUpdate, rows: [{ id: "d1" }] },
    );

    await expect(revokeDelegation(manager, "d1")).resolves.toEqual({ id: "d1" });
  });

  it("unknown delegation → not found", async () => {
    routes({ match: SQL.revokeSelect, rows: [] });

    await expect(revokeDelegation(manager, "nope")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("already-revoked delegation → conflict", async () => {
    routes({
      match: SQL.revokeSelect,
      rows: [{ delegator_id: MANAGER, delegate_id: LEAD, revoked_at: "2026-07-01T00:00:00Z" }],
    });

    await expect(revokeDelegation(manager, "d1")).rejects.toBeInstanceOf(ConflictError);
  });

  it("concurrent revoke loses the race → conflict, not a silent success", async () => {
    routes(
      { match: SQL.revokeSelect, rows: [{ delegator_id: MANAGER, delegate_id: LEAD, revoked_at: null }] },
      { match: SQL.revokeUpdate, rows: [] },
    );

    await expect(revokeDelegation(manager, "d1")).rejects.toBeInstanceOf(ConflictError);
  });
});

/* ── 10. Audit integrity ────────────────────────────────────────────────── */
describe("audit integrity", () => {
  it("createDelegation records both identities and the acting user", async () => {
    routes(activeUser("Lead"), { match: SQL.duplicateCheck, rows: [] }, noCycle, {
      match: SQL.insertDelegation,
      rows: [{ id: "d1" }],
    });

    await createDelegation(manager, {
      delegateId: LEAD,
      fromDate: "2026-07-01",
      toDate: "2026-07-10",
      reason: "leave",
    });

    expect(auditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: MANAGER,
        action: "WORKFLOW_DELEGATION_CREATE",
        newValues: expect.objectContaining({
          delegatorId: MANAGER,
          delegateId: LEAD,
          delegatedBy: MANAGER,
          fromDate: "2026-07-01",
          toDate: "2026-07-10",
          reason: "leave",
        }),
      }),
    );
  });

  it("delegateTask records the delegating approver, the delegate and the task", async () => {
    routes(activeUser("Lead"), noCycle, {
      match: SQL.taskSelect,
      rows: [{ id: "task-1", group_no: 2, resource_type: "pio", resource_id: "pio-1" }],
    }, { match: SQL.taskUpdate, rows: [{ id: "task-1" }] });

    await delegateTask(manager, "instance-1", LEAD, "on site");

    expect(auditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: MANAGER,
        action: "WORKFLOW_TASK_DELEGATE",
        resourceType: "pio",
        resourceId: "pio-1",
        newValues: expect.objectContaining({
          taskId: "task-1",
          instanceId: "instance-1",
          effectiveApprover: LEAD,
          delegatedBy: MANAGER,
          reason: "on site",
        }),
      }),
    );
  });

  it("revokeDelegation is audited", async () => {
    routes(
      { match: SQL.revokeSelect, rows: [{ delegator_id: MANAGER, delegate_id: LEAD, revoked_at: null }] },
      { match: SQL.revokeUpdate, rows: [{ id: "d1" }] },
    );

    await revokeDelegation(manager, "d1");

    expect(auditMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "WORKFLOW_DELEGATION_REVOKE", resourceId: "d1" }),
    );
  });

  it("a rejected delegation writes no audit and no event", async () => {
    routes(activeUser("Lead"), { match: SQL.duplicateCheck, rows: [{ id: "existing" }] });

    await expect(
      createDelegation(manager, { delegateId: LEAD, fromDate: "2026-07-01", toDate: "2026-07-10" }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(auditMock).not.toHaveBeenCalled();
    expect(publishMock).not.toHaveBeenCalled();
  });
});

/* ── 11. Notification routing (Event Bus only) ──────────────────────────── */
describe("notification routing", () => {
  it("createDelegation publishes delegation_created to the delegate", async () => {
    routes(activeUser("Lead"), { match: SQL.duplicateCheck, rows: [] }, noCycle, {
      match: SQL.insertDelegation,
      rows: [{ id: "d1" }],
    });

    await createDelegation(manager, { delegateId: LEAD, fromDate: "2026-07-01", toDate: "2026-07-10" });

    expect(publishMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "workflow.delegation_created",
        category: "approval",
        entityType: "workflow_delegation",
        actorId: MANAGER,
        payload: expect.objectContaining({ recipientId: LEAD }),
      }),
    );
  });

  it("delegateTask publishes task_delegated to the delegate", async () => {
    routes(activeUser("Lead"), noCycle, {
      match: SQL.taskSelect,
      rows: [{ id: "task-1", group_no: 2, resource_type: "pio", resource_id: "pio-1" }],
    }, { match: SQL.taskUpdate, rows: [{ id: "task-1" }] });

    await delegateTask(manager, "instance-1", LEAD);

    expect(publishMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "workflow.task_delegated",
        payload: expect.objectContaining({ recipientId: LEAD, taskId: "task-1" }),
      }),
    );
  });

  it("every delegation event supplies resourceRef — the 'assignment' template titles on it", async () => {
    // Regression guard: without resourceRef the notification rendered a raw
    // "Assigned to you — {{resourceRef}}" placeholder (found in a live drive).
    routes(activeUser("Lead"), { match: SQL.duplicateCheck, rows: [] }, noCycle, {
      match: SQL.insertDelegation,
      rows: [{ id: "d1" }],
    });
    await createDelegation(manager, { delegateId: LEAD, fromDate: "2026-07-01", toDate: "2026-07-10" });

    vi.clearAllMocks();
    routes({ match: SQL.expirySweep, rows: [{ id: "d-x", delegator_id: MANAGER, delegate_id: LEAD, to_date: "2026-07-01" }] });
    await expireStandingDelegations(manager);

    for (const call of publishMock.mock.calls) {
      expect(call[0].payload.resourceRef, `${call[0].type} must supply resourceRef`).toBeTruthy();
    }
  });

  it("revokeDelegation publishes delegation_revoked to the delegate", async () => {
    routes(
      { match: SQL.revokeSelect, rows: [{ delegator_id: MANAGER, delegate_id: LEAD, revoked_at: null }] },
      { match: SQL.revokeUpdate, rows: [{ id: "d1" }] },
    );

    await revokeDelegation(manager, "d1");

    expect(publishMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "workflow.delegation_revoked",
        payload: expect.objectContaining({ recipientId: LEAD }),
      }),
    );
  });
});

/* ── Scheduler auto-expiry (WES §9/§10) ─────────────────────────────────── */
describe("expireStandingDelegations (scheduler sweep)", () => {
  const lapsed = {
    id: "d-lapsed",
    delegator_id: MANAGER,
    delegate_id: LEAD,
    to_date: "2026-07-01",
  };

  it("stamps only lapsed, unrevoked, unstamped delegations (predicate is in the sweep)", async () => {
    routes({ match: SQL.expirySweep, rows: [lapsed] });

    await expireStandingDelegations(manager);

    const [sql] = queryMock.mock.calls[0]!;
    expect(sql).toMatch(/revoked_at IS NULL/);
    expect(sql).toMatch(/expired_at IS NULL/);
    expect(sql).toMatch(/to_date < CURRENT_DATE/);
  });

  it("reports how many it expired", async () => {
    routes({ match: SQL.expirySweep, rows: [lapsed, { ...lapsed, id: "d-2" }] });

    await expect(expireStandingDelegations(manager)).resolves.toEqual({ expired: 2 });
  });

  it("is a no-op when nothing has lapsed — no audit, no events", async () => {
    routes({ match: SQL.expirySweep, rows: [] });

    await expect(expireStandingDelegations(manager)).resolves.toEqual({ expired: 0 });
    expect(auditMock).not.toHaveBeenCalled();
    expect(publishMock).not.toHaveBeenCalled();
  });

  it("audits each expiry with both identities", async () => {
    routes({ match: SQL.expirySweep, rows: [lapsed] });

    await expireStandingDelegations(manager);

    expect(auditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "WORKFLOW_DELEGATION_EXPIRE",
        resourceId: "d-lapsed",
        newValues: expect.objectContaining({
          delegatorId: MANAGER,
          delegateId: LEAD,
          toDate: "2026-07-01",
        }),
      }),
    );
  });

  it("notifies BOTH parties via the Event Bus, deduped per recipient", async () => {
    routes({ match: SQL.expirySweep, rows: [lapsed] });

    await expireStandingDelegations(manager);

    const recipients = publishMock.mock.calls.map((c) => c[0].payload.recipientId);
    expect(recipients).toEqual([LEAD, MANAGER]); // delegate first, then delegator
    for (const call of publishMock.mock.calls) {
      expect(call[0].type).toBe("workflow.delegation_expired");
      expect(call[0].dedupeKey).toMatch(/^workflow\.delegation_expired:d-lapsed:/);
    }
  });
});

/* ── Listing ────────────────────────────────────────────────────────────── */
describe("listDelegations", () => {
  it("returns delegations where the user is delegator or delegate", async () => {
    routes({ match: SQL.listDelegations, rows: [{ id: "d1", active: true }] });

    await expect(listDelegations(manager)).resolves.toEqual([{ id: "d1", active: true }]);
    expect(queryMock).toHaveBeenCalledWith(expect.stringMatching(SQL.listDelegations), [MANAGER]);
  });
});
