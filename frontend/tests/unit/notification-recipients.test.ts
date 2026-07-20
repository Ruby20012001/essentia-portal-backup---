import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Recipient resolution (WES §12) — Phase 4 Step 8, "notification integration".
 *
 * This is the layer that decides WHO gets told, so its failure modes are
 * quiet and expensive: a wrong strategy notifies the wrong person, and an
 * empty result silently notifies nobody. These tests pin each strategy's
 * contract, especially the delegate-awareness that Step 8 added
 * (workflow_task_assignee resolves the EFFECTIVE approver) and the
 * missing-context cases that must return [] rather than throw.
 *
 * The data layer is mocked; the SQL predicates are proven in db/validate.mjs.
 */

const { queryMock, getConfigMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  getConfigMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ query: queryMock }));
vi.mock("@/lib/services/config", () => ({ getConfig: getConfigMock }));

import { resolveRecipients, type RecipientStrategy } from "@/lib/notifications/engine/recipients";
import type { StoredEvent } from "@/lib/notifications/events/types";

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

const SQL = {
  projectTl: /SELECT crmtl_id FROM ee\.projects/,
  stepApprover: /JOIN portal\.workflow_steps ws/,
  taskAssignee: /COALESCE\(t\.delegated_to_user_id, t\.assignee_user_id\)/,
  startedBy: /SELECT started_by FROM portal\.workflow_instances/,
  admins: /FROM public\.users\s+WHERE is_active/,
};

const ASSIGNEE = "11111111-1111-4111-8111-111111111111";
const DELEGATE = "22222222-2222-4222-8222-222222222222";
const OTHER = "33333333-3333-4333-8333-333333333333";
const ACTOR = "44444444-4444-4444-8444-444444444444";

/** Minimal StoredEvent — only the fields the resolver reads. */
const event = (over: Partial<StoredEvent> = {}): StoredEvent =>
  ({
    id: "evt-1",
    type: "workflow.step_pending",
    category: "approval",
    entityType: "pio",
    entityId: "res-1",
    actorId: ACTOR,
    payload: {},
    ...over,
  }) as StoredEvent;

const resolve = (s: RecipientStrategy, e: StoredEvent) => resolveRecipients(s, e);

beforeEach(() => {
  vi.clearAllMocks();
  getConfigMock.mockImplementation(async (key: string, fallback: unknown) => fallback);
});

/* ── explicit ───────────────────────────────────────────────────────────── */
describe("explicit", () => {
  it("takes a single recipientId", async () => {
    await expect(resolve("explicit", event({ payload: { recipientId: ASSIGNEE } }))).resolves.toEqual([ASSIGNEE]);
  });

  it("takes a recipientIds list, and merges both forms", async () => {
    await expect(
      resolve("explicit", event({ payload: { recipientId: ASSIGNEE, recipientIds: [DELEGATE, OTHER] } })),
    ).resolves.toEqual([ASSIGNEE, DELEGATE, OTHER]);
  });

  it("returns nobody when the payload carries no recipient (never throws)", async () => {
    await expect(resolve("explicit", event())).resolves.toEqual([]);
  });
});

/* ── actor ──────────────────────────────────────────────────────────────── */
describe("actor", () => {
  it("resolves the event's actor", async () => {
    await expect(resolve("actor", event())).resolves.toEqual([ACTOR]);
  });

  it("returns nobody for a system event with no actor", async () => {
    await expect(resolve("actor", event({ actorId: null } as Partial<StoredEvent>))).resolves.toEqual([]);
  });
});

/* ── project_tl ─────────────────────────────────────────────────────────── */
describe("project_tl", () => {
  it("resolves the project's CRM TL from an explicit projectId", async () => {
    routes({ match: SQL.projectTl, rows: (p) => (p[0] === "proj-1" ? [{ crmtl_id: ASSIGNEE }] : []) });

    await expect(resolve("project_tl", event({ payload: { projectId: "proj-1" } }))).resolves.toEqual([ASSIGNEE]);
  });

  it("falls back to the event's entityId when no projectId is given", async () => {
    routes({ match: SQL.projectTl, rows: [{ crmtl_id: ASSIGNEE }] });

    await resolve("project_tl", event({ entityId: "res-1" }));

    expect(queryMock).toHaveBeenCalledWith(expect.stringMatching(SQL.projectTl), ["res-1"]);
  });

  it("returns nobody for an unowned project rather than throwing", async () => {
    routes({ match: SQL.projectTl, rows: [{ crmtl_id: null }] });

    await expect(resolve("project_tl", event({ payload: { projectId: "proj-1" } }))).resolves.toEqual([]);
  });
});

/* ── workflow_task_assignee — the Step 8 strategy ───────────────────────── */
describe("workflow_task_assignee (delegate-aware, WES §12)", () => {
  it("notifies the DELEGATE, not the original assignee, when the task is delegated", async () => {
    // The SQL COALESCEs to the effective approver; the resolver returns it as-is.
    routes({ match: SQL.taskAssignee, rows: [{ uid: DELEGATE }] });

    await expect(resolve("workflow_task_assignee", event({ payload: { instanceId: "inst-1" } }))).resolves.toEqual([
      DELEGATE,
    ]);
  });

  it("notifies EVERY pending approver in a parallel group", async () => {
    routes({ match: SQL.taskAssignee, rows: [{ uid: ASSIGNEE }, { uid: DELEGATE }, { uid: OTHER }] });

    await expect(resolve("workflow_task_assignee", event({ payload: { instanceId: "inst-1" } }))).resolves.toEqual([
      ASSIGNEE,
      DELEGATE,
      OTHER,
    ]);
  });

  it("scopes to the instance's CURRENT group and pending tasks only", async () => {
    routes({ match: SQL.taskAssignee, rows: [] });

    await resolve("workflow_task_assignee", event({ payload: { instanceId: "inst-1" } }));

    const [sql, params] = queryMock.mock.calls[0]!;
    expect(sql).toMatch(/t\.group_no = i\.current_step/);
    expect(sql).toMatch(/t\.status = 'pending'/);
    expect(params).toEqual(["inst-1"]);
  });

  it("drops null effective approvers rather than emitting an undefined recipient", async () => {
    routes({ match: SQL.taskAssignee, rows: [{ uid: ASSIGNEE }, { uid: null }] });

    await expect(resolve("workflow_task_assignee", event({ payload: { instanceId: "inst-1" } }))).resolves.toEqual([
      ASSIGNEE,
    ]);
  });

  it("returns nobody — and issues no query — without an instanceId", async () => {
    routes({ match: SQL.taskAssignee, rows: [{ uid: ASSIGNEE }] });

    await expect(resolve("workflow_task_assignee", event())).resolves.toEqual([]);
    expect(queryMock).not.toHaveBeenCalled();
  });
});

/* ── workflow_step_approver (legacy step model) ─────────────────────────── */
describe("workflow_step_approver", () => {
  it("resolves the current step's approver", async () => {
    routes({ match: SQL.stepApprover, rows: [{ approver_user_id: ASSIGNEE }] });

    await expect(resolve("workflow_step_approver", event({ payload: { instanceId: "inst-1" } }))).resolves.toEqual([
      ASSIGNEE,
    ]);
  });

  it("returns nobody when the step's approver is unmapped", async () => {
    routes({ match: SQL.stepApprover, rows: [{ approver_user_id: null }] });

    await expect(resolve("workflow_step_approver", event({ payload: { instanceId: "inst-1" } }))).resolves.toEqual([]);
  });

  it("returns nobody without an instanceId", async () => {
    await expect(resolve("workflow_step_approver", event())).resolves.toEqual([]);
  });
});

/* ── workflow_started_by ────────────────────────────────────────────────── */
describe("workflow_started_by", () => {
  it("resolves the initiator", async () => {
    routes({ match: SQL.startedBy, rows: [{ started_by: ACTOR }] });

    await expect(resolve("workflow_started_by", event({ payload: { instanceId: "inst-1" } }))).resolves.toEqual([ACTOR]);
  });

  it("returns nobody for a system-started instance", async () => {
    routes({ match: SQL.startedBy, rows: [{ started_by: null }] });

    await expect(resolve("workflow_started_by", event({ payload: { instanceId: "inst-1" } }))).resolves.toEqual([]);
  });
});

/* ── platform_admins (config-driven) ────────────────────────────────────── */
describe("platform_admins", () => {
  it("targets the configured access levels — policy is config, not code", async () => {
    getConfigMock.mockImplementation(async (key: string, fallback: unknown) =>
      key === "notifications.admin_alert_levels" ? ["L0", "L1"] : fallback,
    );
    routes({ match: SQL.admins, rows: [{ id: ASSIGNEE }] });

    await resolve("platform_admins", event());

    const [, params] = queryMock.mock.calls[0]!;
    expect(params[0]).toEqual(["L0", "L1"]);
  });

  it("also matches configured job-title patterns, as LIKE parameters", async () => {
    getConfigMock.mockImplementation(async (key: string, fallback: unknown) =>
      key === "notifications.admin_alert_title_patterns" ? ["COO", "Platform Admin"] : fallback,
    );
    routes({ match: SQL.admins, rows: [{ id: ASSIGNEE }, { id: OTHER }] });

    const out = await resolve("platform_admins", event());

    const [sql, params] = queryMock.mock.calls[0]!;
    expect(sql).toMatch(/job_title ILIKE/);
    expect(params).toEqual([["L0"], "%COO%", "%Platform Admin%"]);
    expect(out).toEqual([ASSIGNEE, OTHER]);
  });

  it("with no title patterns configured, matches on access level alone", async () => {
    routes({ match: SQL.admins, rows: [{ id: ASSIGNEE }] });

    await resolve("platform_admins", event());

    const [sql] = queryMock.mock.calls[0]!;
    expect(sql).not.toMatch(/job_title ILIKE/);
  });
});

/* ── unknown strategy ───────────────────────────────────────────────────── */
describe("unknown strategy", () => {
  it("resolves to nobody instead of throwing (a bad route must not break dispatch)", async () => {
    await expect(resolve("not_a_strategy" as RecipientStrategy, event())).resolves.toEqual([]);
  });
});
