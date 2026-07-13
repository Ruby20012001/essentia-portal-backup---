import { query } from "@/lib/db";
import { writeAudit } from "@/lib/services/audit";
import { requirePermission } from "@/lib/services/permissions";
import { NotFoundError } from "@/lib/services/blocking";
import { aiCompleteFromPrompt } from "@/lib/ai";
import { RESOURCE_REF_SQL, RESOURCE_REF_JOINS } from "@/lib/services/workflow-inbox";
import type { SessionUser } from "@/lib/auth/session";

/**
 * Workflow AI advisory (WES §13 / ADR-013). Gives an approver a deterministic
 * SLA-risk read plus an optional AI summary / anomaly flag for the item under
 * review. STRICTLY ADVISORY: this is read-only — the AI never approves,
 * rejects, delegates, or mutates any workflow state, and an AI failure never
 * blocks a workflow (it degrades to "unavailable"). Every AI call is audited
 * (model + purpose + tokens) inside lib/ai.
 */

export type SlaRisk = {
  level: "none" | "ok" | "medium" | "high" | "breached";
  hoursRemaining: number | null;
  breachedCount: number;
  pendingCount: number;
};

/** Deterministic SLA-breach risk from the current group's pending deadlines. Pure. */
export function computeSlaRisk(now: Date, slaDueAts: Array<string | null>): SlaRisk {
  const pendingCount = slaDueAts.length;
  const due = slaDueAts
    .filter((d): d is string => Boolean(d))
    .map((d) => new Date(d).getTime())
    .filter((t) => Number.isFinite(t));
  if (due.length === 0) return { level: "none", hoursRemaining: null, breachedCount: 0, pendingCount };
  const nowMs = now.getTime();
  const breachedCount = due.filter((t) => t <= nowMs).length;
  if (breachedCount > 0) return { level: "breached", hoursRemaining: 0, breachedCount, pendingCount };
  const hoursRemaining = (Math.min(...due) - nowMs) / 3_600_000;
  const level = hoursRemaining < 12 ? "high" : hoursRemaining < 24 ? "medium" : "ok";
  return { level, hoursRemaining: Math.round(hoursRemaining * 10) / 10, breachedCount: 0, pendingCount };
}

export type WorkflowAdvisory = {
  instanceId: string;
  resourceRef: string;
  workflowName: string;
  status: string;
  slaRisk: SlaRisk;
  ai: { available: true; summary: string; provider: string; model: string } | { available: false; reason: string };
  disclaimer: string;
};

export async function getWorkflowAdvisory(user: SessionUser, instanceId: string): Promise<WorkflowAdvisory> {
  await requirePermission(user, "read", "workflows");

  const [inst] = await query<{
    workflow_code: string;
    workflow_name: string;
    resource_type: string;
    resource_id: string;
    resource_ref: string | null;
    status: string;
    current_step: number;
    context: Record<string, unknown> | null;
  }>(
    `SELECT i.workflow_code, d.name AS workflow_name, i.resource_type, i.resource_id,
            ${RESOURCE_REF_SQL} AS resource_ref,
            i.status, i.current_step, i.context
     FROM portal.workflow_instances i
     JOIN portal.workflow_definitions d ON d.code = i.workflow_code${RESOURCE_REF_JOINS}
     WHERE i.id = $1`,
    [instanceId],
  );
  if (!inst) throw new NotFoundError("Workflow instance not found.");

  const tasks = await query<{ sla_due_at: string | null }>(
    `SELECT sla_due_at::text FROM portal.workflow_tasks
     WHERE instance_id = $1 AND group_no = $2 AND status = 'pending'`,
    [instanceId, inst.current_step],
  );
  const slaRisk = computeSlaRisk(new Date(), tasks.map((t) => t.sla_due_at));
  const resourceRef = inst.resource_ref ?? `${inst.resource_type} ${inst.resource_id}`;

  // Advisory AI — graceful: a missing key / provider error / permission denial
  // degrades to "unavailable" and never blocks the approval.
  let ai: WorkflowAdvisory["ai"];
  try {
    const resp = await aiCompleteFromPrompt(user, "workflow_advisory", {
      workflowName: inst.workflow_name,
      status: inst.status,
      resourceRef,
      context: JSON.stringify(inst.context ?? {}),
    });
    ai = { available: true, summary: resp.text, provider: resp.provider, model: resp.model };
  } catch (error) {
    ai = { available: false, reason: error instanceof Error ? error.message : "AI unavailable" };
  }

  await writeAudit({
    userId: user.id, role: user.accessLevel, action: "WORKFLOW_ADVISORY",
    resourceType: inst.resource_type, resourceId: inst.resource_id,
    newValues: { instanceId, aiAvailable: ai.available, slaLevel: slaRisk.level },
  });

  return {
    instanceId, resourceRef, workflowName: inst.workflow_name, status: inst.status, slaRisk, ai,
    disclaimer: "Advisory only — the approver decides. AI never approves, rejects, or changes workflow state.",
  };
}
