import { query } from "@/lib/db";

/**
 * Workflow audit read model (frontend screen 2, Audit tab). A READ-ONLY
 * aggregation that unifies three EXISTING sources for one instance — it copies
 * nothing into a new table and adds no business logic:
 *
 *   workflow_actions          → approvals / rejections (the decisions)
 *   audit.log                 → delegation, SLA breach, timeout (the engine's
 *                               recorded side-effects)
 *   events + notification_    → notification history (what was sent, to whom,
 *   deliveries                  on which channel, with what result)
 *
 * The instance link is the one that already exists: workflow events carry
 * payload.instanceId, so a delivery joins back to the instance through its
 * event. Nothing here writes.
 */

export type WorkflowAuditKind =
  | "approval"
  | "delegation"
  | "sla"
  | "escalation"
  | "timeout"
  | "notification";

export type WorkflowAuditEntry = {
  at: string;
  kind: WorkflowAuditKind;
  title: string;
  actor: string | null; // who acted, or who a notification was sent to
  detail: string | null;
};

function humanizeEvent(eventType: string): string {
  const label = eventType.replace(/^workflow\./, "").replace(/_/g, " ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export async function getWorkflowAudit(instanceId: string): Promise<WorkflowAuditEntry[]> {
  // 1. Decisions — from workflow_actions (approve / reject), the richest record
  //    (carries the group and any comment).
  const actions = await query<{
    action: string;
    group_no: number | null;
    comments: string | null;
    at: string;
    actor: string | null;
  }>(
    `SELECT wa.action, wa.step_no AS group_no, wa.comments,
            wa.acted_at::text AS at, u.full_name AS actor
     FROM portal.workflow_actions wa
     LEFT JOIN public.users u ON u.id = wa.acted_by
     WHERE wa.instance_id = $1`,
    [instanceId],
  );

  // 2. Engine side-effects — from audit.log. Approvals are excluded (source 1
  //    already has them, richer). Rows tie to the instance either by the
  //    'workflows' resource key or by new_values.instanceId (task delegation).
  const audits = await query<{
    action: string;
    at: string;
    actor: string | null;
    new_values: Record<string, unknown> | null;
  }>(
    `SELECT l.action, l.created_at::text AS at, u.full_name AS actor, l.new_values
     FROM audit.log l
     LEFT JOIN public.users u ON u.id = l.user_id
     WHERE l.action LIKE 'WORKFLOW\\_%'
       AND l.action NOT IN ('WORKFLOW_APPROVE', 'WORKFLOW_REJECT')
       AND ( (l.resource_type = 'workflows' AND l.resource_id::text = $1)
             OR l.new_values->>'instanceId' = $1 )`,
    [instanceId],
  );

  // 3. Notification history — the existing events + deliveries, linked to the
  //    instance through the event payload. One row per delivery (recipient).
  const notifications = await query<{
    event_type: string;
    at: string;
    recipient: string | null;
    notification_type: string | null;
    channel: string | null;
    status: string | null;
  }>(
    `SELECT e.event_type, nd.created_at::text AS at, r.full_name AS recipient,
            nd.notification_type, nd.channel, nd.status
     FROM portal.events e
     JOIN portal.notification_deliveries nd ON nd.event_id = e.id
     LEFT JOIN public.users r ON r.id = nd.recipient_id
     WHERE e.payload->>'instanceId' = $1`,
    [instanceId],
  );

  const entries: WorkflowAuditEntry[] = [];

  for (const a of actions) {
    entries.push({
      at: a.at,
      kind: "approval",
      title: a.action === "approve" ? "Approved" : "Rejected",
      actor: a.actor,
      detail: [a.group_no != null ? `Step ${a.group_no}` : null, a.comments].filter(Boolean).join(" · ") || null,
    });
  }

  for (const a of audits) {
    const nv = a.new_values ?? {};
    if (a.action === "WORKFLOW_SLA_BREACH") {
      entries.push({ at: a.at, kind: "sla", title: "SLA breached", actor: a.actor, detail: null });
      if (nv.escalatedTo) {
        entries.push({ at: a.at, kind: "escalation", title: "Escalated", actor: a.actor, detail: "Handed to the escalation target." });
      }
    } else if (a.action === "WORKFLOW_TIMEOUT") {
      entries.push({ at: a.at, kind: "timeout", title: "Timed out", actor: a.actor, detail: nv.action ? `Action: ${String(nv.action)}` : null });
    } else if (a.action === "WORKFLOW_TIMEOUT_FAILED") {
      entries.push({ at: a.at, kind: "timeout", title: "Timeout failed", actor: a.actor, detail: nv.error ? String(nv.error) : null });
    } else if (a.action === "WORKFLOW_TASK_DELEGATE" || a.action.startsWith("WORKFLOW_DELEGATION")) {
      entries.push({ at: a.at, kind: "delegation", title: "Delegated", actor: a.actor, detail: null });
    }
  }

  for (const n of notifications) {
    const kind: WorkflowAuditKind = n.event_type === "workflow.escalated" ? "escalation" : "notification";
    entries.push({
      at: n.at,
      kind,
      title: humanizeEvent(n.event_type),
      actor: n.recipient,
      detail: [n.channel, n.status].filter(Boolean).join(" · ") || null,
    });
  }

  // Most recent first — an audit feed reads newest-down.
  entries.sort((x, y) => (x.at < y.at ? 1 : x.at > y.at ? -1 : 0));
  return entries;
}
