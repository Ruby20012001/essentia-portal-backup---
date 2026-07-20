import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Workflow SLA / timer sweep (WES §8) — Phase 4 Step 7.
 *
 * SCOPE. The sweep is DB-backed, so these are unit tests of the TypeScript
 * contract: which tasks each phase selects, who is notified (delegate-aware),
 * dedupe keys, the timeout actions delegated to the engine, error isolation and
 * the returned counters. The data layer is mocked; the SQL-resident predicates
 * (warn_at/sla_due_at/timeout_at <= NOW(), reminder cadence) are asserted at the
 * TS boundary here and proven against real PostgreSQL in db/validate.mjs.
 */

const { queryMock, auditMock, publishMock, actMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  auditMock: vi.fn(),
  publishMock: vi.fn(),
  actMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ query: queryMock }));
vi.mock("@/lib/services/audit", () => ({ writeAudit: auditMock }));
vi.mock("@/lib/notifications", () => ({ publishEvent: publishMock }));
vi.mock("@/lib/services/workflows", () => ({ actOnWorkflow: actMock }));

import { evaluateWorkflowTimers } from "@/lib/services/workflow-timers";

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

// SQL fingerprints of each phase of the sweep.
const SQL = {
  warn: /warn_at IS NOT NULL AND warn_at <= NOW\(\)/,
  breach: /sla_due_at IS NOT NULL AND sla_due_at <= NOW\(\)/,
  remind: /g\.reminder_hours IS NOT NULL/,
  timeout: /t\.timeout_at IS NOT NULL/,
  escalationRef: /ga\.escalation_type, ga\.escalation_ref/,
  userLookup: /SELECT id FROM public\.users WHERE \(id::text/,
  startedBy: /SELECT started_by FROM portal\.workflow_instances/,
  remindedAt: /SET reminded_at = NOW\(\)/,
  markStatus: /UPDATE portal\.workflow_tasks SET status = \$2/,
  stampWarned: /SET sla_warned_at = NOW\(\)/,
  stampBreached: /SET sla_breached_at = NOW\(\)/,
  insertTask: /INSERT INTO portal\.workflow_tasks \(instance_id, group_no, assignee_user_id, assigned_at\)/,
};

const ASSIGNEE = "11111111-1111-4111-8111-111111111111";
const DELEGATE = "22222222-2222-4222-8222-222222222222";
const BOSS = "33333333-3333-4333-8333-333333333333";

const actor = { id: "99999999-9999-4999-8999-999999999999", name: "Auto-Pilot", accessLevel: "L1" as const, departmentId: null };

const task = (over: Row = {}): Row => ({
  id: "task-1",
  instance_id: "inst-1",
  group_no: 1,
  assignee_user_id: ASSIGNEE,
  delegated_to_user_id: null,
  ...over,
});

const eventsOfType = (type: string) => publishMock.mock.calls.map((c) => c[0]).filter((e) => e.type === type);

beforeEach(() => {
  vi.clearAllMocks();
  actMock.mockResolvedValue({});
});

/* ── Nothing due ────────────────────────────────────────────────────────── */
describe("an idle sweep", () => {
  it("returns all-zero counters and publishes nothing", async () => {
    routes();

    await expect(evaluateWorkflowTimers(actor)).resolves.toEqual({
      warnings: 0,
      breaches: 0,
      escalations: 0,
      reminders: 0,
      timeouts: 0,
      timeoutFailures: 0,
    });
    expect(publishMock).not.toHaveBeenCalled();
    expect(actMock).not.toHaveBeenCalled();
  });
});

/* ── 1. SLA warnings ────────────────────────────────────────────────────── */
describe("SLA warning", () => {
  it("publishes workflow.sla_warning once per task (deduped by task id)", async () => {
    routes({ match: SQL.warn, rows: [task()] });

    const r = await evaluateWorkflowTimers(actor);

    const [e] = eventsOfType("workflow.sla_warning");
    expect(r.warnings).toBe(1);
    expect(e.dedupeKey).toBe("workflow.sla_warning:task-1");
    expect(e.entityType).toBe("workflow_task");
    expect(e.payload.recipientId).toBe(ASSIGNEE);
  });

  it("notifies the DELEGATE when the task is delegated, not the original assignee", async () => {
    routes({ match: SQL.warn, rows: [task({ delegated_to_user_id: DELEGATE })] });

    await evaluateWorkflowTimers(actor);

    expect(eventsOfType("workflow.sla_warning")[0].payload.recipientId).toBe(DELEGATE);
  });

  it("a warning never decides the task", async () => {
    routes({ match: SQL.warn, rows: [task()] });

    await evaluateWorkflowTimers(actor);

    expect(actMock).not.toHaveBeenCalled();
  });

  it("fires once per task: selects only un-stamped tasks and stamps as it goes", async () => {
    routes({ match: SQL.warn, rows: [task()] });

    await evaluateWorkflowTimers(actor);

    const [sql] = queryMock.mock.calls.find(([s]) => SQL.warn.test(String(s)))!;
    expect(sql).toMatch(/sla_warned_at IS NULL/);
    expect(queryMock).toHaveBeenCalledWith(expect.stringMatching(SQL.stampWarned), ["task-1"]);
  });
});

/* ── 2. Breach + escalation ─────────────────────────────────────────────── */
describe("SLA breach", () => {
  it("publishes an urgent sla_breached to the effective approver and audits it", async () => {
    routes({ match: SQL.breach, rows: [task({ delegated_to_user_id: DELEGATE })] });

    const r = await evaluateWorkflowTimers(actor);

    const [e] = eventsOfType("workflow.sla_breached");
    expect(r.breaches).toBe(1);
    expect(e.priority).toBe("urgent");
    expect(e.dedupeKey).toBe("workflow.sla_breached:task-1");
    expect(e.payload.recipientId).toBe(DELEGATE);
    expect(auditMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "WORKFLOW_SLA_BREACH", newValues: expect.objectContaining({ taskId: "task-1" }) }),
    );
  });

  it("fires once per task — no repeat audit row on every tick", async () => {
    routes({ match: SQL.breach, rows: [task()] });

    await evaluateWorkflowTimers(actor);

    const [sql] = queryMock.mock.calls.find(([s]) => SQL.breach.test(String(s)))!;
    expect(sql).toMatch(/sla_breached_at IS NULL/);
    expect(queryMock).toHaveBeenCalledWith(expect.stringMatching(SQL.stampBreached), ["task-1"]);
    expect(auditMock).toHaveBeenCalledTimes(1);
  });

  it("breach does NOT decide the task (WES §8: breach never approves/rejects)", async () => {
    routes({ match: SQL.breach, rows: [task()] });

    await evaluateWorkflowTimers(actor);

    expect(actMock).not.toHaveBeenCalled();
  });

  it("escalates to the group's declared target", async () => {
    routes(
      { match: SQL.breach, rows: [task()] },
      { match: SQL.escalationRef, rows: [{ escalation_type: "user", escalation_ref: "boss@essentia.in" }] },
      { match: SQL.userLookup, rows: [{ id: BOSS }] },
    );

    const r = await evaluateWorkflowTimers(actor);

    const [e] = eventsOfType("workflow.escalated");
    expect(r.escalations).toBe(1);
    expect(e.payload.recipientId).toBe(BOSS);
    expect(e.dedupeKey).toBe("workflow.escalated:task-1");
  });

  it("falls back to the workflow starter when no escalation target is declared", async () => {
    routes(
      { match: SQL.breach, rows: [task()] },
      { match: SQL.startedBy, rows: [{ started_by: BOSS }] },
    );

    await evaluateWorkflowTimers(actor);

    expect(eventsOfType("workflow.escalated")[0].payload.recipientId).toBe(BOSS);
  });

  it("does not escalate to the person already holding the task", async () => {
    routes(
      { match: SQL.breach, rows: [task()] },
      { match: SQL.startedBy, rows: [{ started_by: ASSIGNEE }] },
    );

    const r = await evaluateWorkflowTimers(actor);

    expect(eventsOfType("workflow.escalated")).toHaveLength(0);
    expect(r.escalations).toBe(0);
  });

  it("does not escalate when there is no resolvable target at all", async () => {
    routes({ match: SQL.breach, rows: [task()] }, { match: SQL.startedBy, rows: [{ started_by: null }] });

    const r = await evaluateWorkflowTimers(actor);

    expect(r.escalations).toBe(0);
    expect(eventsOfType("workflow.escalated")).toHaveLength(0);
  });
});

/* ── Escalation transfers ownership (WES §8) ────────────────────────────── */
describe("escalation reassigns, it does not merely alert", () => {
  const escalating = (): Handler[] => [
    { match: SQL.breach, rows: [task()] },
    { match: SQL.startedBy, rows: [{ started_by: BOSS }] },
    { match: SQL.markStatus, rows: [{ id: "task-1" }] },
  ];

  it("marks the original task 'escalated' and materialises a task for the target", async () => {
    routes(...escalating());

    await evaluateWorkflowTimers(actor);

    expect(queryMock).toHaveBeenCalledWith(expect.stringMatching(SQL.markStatus), ["task-1", "escalated"]);
    expect(queryMock).toHaveBeenCalledWith(expect.stringMatching(SQL.insertTask), ["inst-1", 1, BOSS]);
  });

  it("the escalation task carries NO deadlines, so it cannot immediately re-breach", async () => {
    routes(...escalating());

    await evaluateWorkflowTimers(actor);

    const [sql] = queryMock.mock.calls.find(([s]) => SQL.insertTask.test(String(s)))!;
    expect(sql).not.toMatch(/sla_due_at|warn_at|timeout_at/);
  });

  it("never resurrects a task the target already decided", async () => {
    routes(...escalating());

    await evaluateWorkflowTimers(actor);

    const [sql] = queryMock.mock.calls.find(([s]) => SQL.insertTask.test(String(s)))!;
    expect(sql).toMatch(/status NOT IN \('approved', 'rejected'\)/);
  });

  it("records whether the transfer actually happened in the breach audit", async () => {
    routes(...escalating());

    await evaluateWorkflowTimers(actor);

    expect(auditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "WORKFLOW_SLA_BREACH",
        newValues: expect.objectContaining({ escalatedTo: BOSS, transferred: true }),
      }),
    );
  });

  it("does not materialise a task when the original was decided concurrently (CAS lost)", async () => {
    routes(
      { match: SQL.breach, rows: [task()] },
      { match: SQL.startedBy, rows: [{ started_by: BOSS }] },
      { match: SQL.markStatus, rows: [] }, // CAS matched nothing
    );

    await evaluateWorkflowTimers(actor);

    expect(queryMock).not.toHaveBeenCalledWith(expect.stringMatching(SQL.insertTask), expect.anything());
    expect(auditMock).toHaveBeenCalledWith(
      expect.objectContaining({ newValues: expect.objectContaining({ transferred: false }) }),
    );
  });

  it("transfers on timeout_action='escalate' too, marking the original timed_out", async () => {
    routes(
      { match: SQL.timeout, rows: [task({ timeout_action: "escalate" })] },
      { match: SQL.startedBy, rows: [{ started_by: BOSS }] },
      { match: SQL.markStatus, rows: [{ id: "task-1" }] },
    );

    await evaluateWorkflowTimers(actor);

    expect(queryMock).toHaveBeenCalledWith(expect.stringMatching(SQL.markStatus), ["task-1", "timed_out"]);
    expect(queryMock).toHaveBeenCalledWith(expect.stringMatching(SQL.insertTask), ["inst-1", 1, BOSS]);
  });

  it("leaves the task PENDING when no target resolves — never strands the group", async () => {
    routes(
      { match: SQL.timeout, rows: [task({ timeout_action: "escalate" })] },
      { match: SQL.startedBy, rows: [{ started_by: null }] },
    );

    await evaluateWorkflowTimers(actor);

    expect(queryMock).not.toHaveBeenCalledWith(expect.stringMatching(SQL.markStatus), expect.anything());
  });
});

/* ── 3. Reminders ───────────────────────────────────────────────────────── */
describe("reminders", () => {
  it("re-notifies the effective approver and advances reminded_at", async () => {
    routes({ match: SQL.remind, rows: [task({ delegated_to_user_id: DELEGATE })] });

    const r = await evaluateWorkflowTimers(actor);

    expect(r.reminders).toBe(1);
    expect(eventsOfType("workflow.task_reminded")[0].payload.recipientId).toBe(DELEGATE);
    expect(queryMock).toHaveBeenCalledWith(expect.stringMatching(SQL.remindedAt), ["task-1"]);
  });

  it("is recurring by design — no dedupe key, the cadence comes from reminded_at", async () => {
    routes({ match: SQL.remind, rows: [task()] });

    await evaluateWorkflowTimers(actor);

    expect(eventsOfType("workflow.task_reminded")[0].dedupeKey).toBeUndefined();
  });
});

/* ── 4. Timeout actions ─────────────────────────────────────────────────── */
describe("timeout actions", () => {
  it("auto_approve decides through the engine, passing the task id as the system actor", async () => {
    routes({ match: SQL.timeout, rows: [task({ timeout_action: "auto_approve" })] });

    const r = await evaluateWorkflowTimers(actor);

    expect(actMock).toHaveBeenCalledWith(actor, "inst-1", "approve", expect.stringMatching(/timeout/i), "task-1");
    expect(r.timeouts).toBe(1);
    expect(auditMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "WORKFLOW_TIMEOUT", newValues: expect.objectContaining({ action: "auto_approve" }) }),
    );
  });

  it("auto_reject decides through the engine", async () => {
    routes({ match: SQL.timeout, rows: [task({ timeout_action: "auto_reject" })] });

    await evaluateWorkflowTimers(actor);

    expect(actMock).toHaveBeenCalledWith(actor, "inst-1", "reject", expect.stringMatching(/timeout/i), "task-1");
  });

  it("escalate notifies instead of deciding", async () => {
    routes(
      { match: SQL.timeout, rows: [task({ timeout_action: "escalate" })] },
      { match: SQL.startedBy, rows: [{ started_by: BOSS }] },
    );

    const r = await evaluateWorkflowTimers(actor);

    expect(actMock).not.toHaveBeenCalled();
    expect(eventsOfType("workflow.timed_out")[0].dedupeKey).toBe("workflow.timed_out:task-1");
    expect(eventsOfType("workflow.escalated")[0].payload.recipientId).toBe(BOSS);
    expect(r.timeouts).toBe(1);
  });

  it("one failing task does not wedge the sweep — later tasks still run", async () => {
    routes({
      match: SQL.timeout,
      rows: [
        task({ id: "task-bad", timeout_action: "auto_approve" }),
        task({ id: "task-good", instance_id: "inst-2", timeout_action: "auto_approve" }),
      ],
    });
    actMock.mockRejectedValueOnce(new Error("instance already completed"));

    const r = await evaluateWorkflowTimers(actor);

    expect(actMock).toHaveBeenCalledTimes(2);
    expect(r.timeouts).toBe(1); // the failed one is not counted as applied
  });

  it("a failed timeout is COUNTED and AUDITED, never silently swallowed", async () => {
    routes({ match: SQL.timeout, rows: [task({ timeout_action: "auto_approve" })] });
    actMock.mockRejectedValueOnce(new Error("instance already completed"));

    const r = await evaluateWorkflowTimers(actor);

    expect(r.timeoutFailures).toBe(1);
    expect(r.timeouts).toBe(0);
    expect(auditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "WORKFLOW_TIMEOUT_FAILED",
        newValues: expect.objectContaining({
          taskId: "task-1",
          action: "auto_approve",
          error: "instance already completed",
        }),
      }),
    );
  });
});

/* ── Notification payload contract ──────────────────────────────────────── */
describe("every timer event supplies title + summary", () => {
  it("the 'system_alert' template titles on {{title}} — no event may omit it", async () => {
    // Regression guard: without title the SLA notifications rendered a raw
    // "System alert — {{title}}" placeholder (found in a live drive).
    routes(
      { match: SQL.warn, rows: [task({ id: "w1" })] },
      { match: SQL.breach, rows: [task({ id: "b1" })] },
      { match: SQL.remind, rows: [task({ id: "r1" })] },
      { match: SQL.timeout, rows: [task({ id: "t1", timeout_action: "escalate" })] },
      { match: SQL.startedBy, rows: [{ started_by: BOSS }] },
    );

    await evaluateWorkflowTimers(actor);

    expect(publishMock.mock.calls.length).toBeGreaterThan(0);
    for (const [event] of publishMock.mock.calls) {
      expect(event.payload.title, `${event.type} must supply title`).toBeTruthy();
      expect(event.payload.summary, `${event.type} must supply summary`).toBeTruthy();
      expect(event.payload.recipientId, `${event.type} must supply recipientId`).toBeTruthy();
    }
  });
});

/* ── Sweep independence (ADR-WE-007) ────────────────────────────────────── */
describe("sweep is driven by stored deadlines, not tick timing", () => {
  it("selects work purely from timestamp predicates on the task rows", async () => {
    routes();

    await evaluateWorkflowTimers(actor);

    const sqls = queryMock.mock.calls.map((c) => String(c[0]));
    expect(sqls.some((s) => SQL.warn.test(s))).toBe(true);
    expect(sqls.some((s) => SQL.breach.test(s))).toBe(true);
    expect(sqls.some((s) => SQL.timeout.test(s))).toBe(true);
    // Every phase filters to still-pending work.
    for (const s of sqls) expect(s).toMatch(/status = 'pending'/);
  });

  it("counts each phase independently in one pass", async () => {
    routes(
      { match: SQL.warn, rows: [task({ id: "w1" })] },
      { match: SQL.breach, rows: [task({ id: "b1" })] },
      { match: SQL.remind, rows: [task({ id: "r1" })] },
      { match: SQL.timeout, rows: [task({ id: "t1", timeout_action: "auto_approve" })] },
      { match: SQL.startedBy, rows: [{ started_by: BOSS }] },
    );

    await expect(evaluateWorkflowTimers(actor)).resolves.toEqual({
      warnings: 1,
      breaches: 1,
      escalations: 1,
      reminders: 1,
      timeouts: 1,
      timeoutFailures: 0,
    });
  });
});
