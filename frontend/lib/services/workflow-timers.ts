import { query } from "@/lib/db";
import { writeAudit } from "@/lib/services/audit";
import { publishEvent } from "@/lib/notifications";
import { actOnWorkflow } from "@/lib/services/workflows";
import type { SessionUser } from "@/lib/auth/session";

/**
 * Workflow SLA / timer sweep (WES §8), driven by the `workflow-timers` scheduler
 * job. For each pending task it: fires an early SLA warning, an SLA breach (with
 * escalation), periodic reminders, and applies the group's timeout action
 * (auto-approve / auto-reject / escalate). Correctness is independent of tick
 * timing — everything is computed from the task's stored deadlines. Idempotent:
 * warning/breach/escalation events dedupe per task; reminders advance
 * reminded_at; auto-decisions guard on task state via CAS in the engine.
 */

type TaskRow = {
  id: string;
  instance_id: string;
  group_no: number;
  assignee_user_id: string;
  delegated_to_user_id: string | null;
};

const effective = (t: TaskRow): string => t.delegated_to_user_id ?? t.assignee_user_id;

/** Resolve the escalation target for a task's group, falling back to the starter. */
async function resolveEscalationTarget(instanceId: string, groupNo: number): Promise<string | null> {
  const [e] = await query<{ escalation_type: string | null; escalation_ref: string | null }>(
    `SELECT ga.escalation_type, ga.escalation_ref
     FROM portal.workflow_group_approvers ga
     JOIN portal.workflow_groups g ON g.id = ga.group_id
     JOIN portal.workflow_instances i ON i.workflow_code = g.definition_code
     WHERE i.id = $1 AND g.group_no = $2 AND ga.escalation_ref IS NOT NULL
     LIMIT 1`,
    [instanceId, groupNo],
  );
  if (e?.escalation_ref && (e.escalation_type === "user" || e.escalation_type === null)) {
    const [u] = await query<{ id: string }>(
      `SELECT id FROM public.users WHERE (id::text = $1 OR lower(email) = lower($1)) AND is_active`,
      [e.escalation_ref],
    );
    if (u) return u.id;
  }
  const [inst] = await query<{ started_by: string | null }>(
    `SELECT started_by FROM portal.workflow_instances WHERE id = $1`,
    [instanceId],
  );
  return inst?.started_by ?? null;
}

export type TimerSweepResult = {
  warnings: number;
  breaches: number;
  escalations: number;
  reminders: number;
  timeouts: number;
};

export async function evaluateWorkflowTimers(actor: SessionUser): Promise<TimerSweepResult> {
  const result: TimerSweepResult = { warnings: 0, breaches: 0, escalations: 0, reminders: 0, timeouts: 0 };
  const TASK_COLS = `id, instance_id, group_no, assignee_user_id, delegated_to_user_id`;

  // 1. SLA warnings — an early nudge before the deadline. Deduped per task.
  for (const t of await query<TaskRow>(
    `SELECT ${TASK_COLS} FROM portal.workflow_tasks
     WHERE status = 'pending' AND warn_at IS NOT NULL AND warn_at <= NOW()`,
  )) {
    await publishEvent({
      type: "workflow.sla_warning", category: "approval",
      entityType: "workflow_task", entityId: t.id, actorId: actor.id,
      // The 'system_alert' template titles on {{title}} — always supply it.
      payload: { instanceId: t.instance_id, recipientId: effective(t),
        title: "Approval approaching its deadline",
        summary: "An approval assigned to you is approaching its deadline.", actionUrl: "/wio-pio" },
      dedupeKey: `workflow.sla_warning:${t.id}`,
    });
    result.warnings++;
  }

  // 2. SLA breaches — past the deadline; alert the approver and escalate. Deduped.
  for (const t of await query<TaskRow>(
    `SELECT ${TASK_COLS} FROM portal.workflow_tasks
     WHERE status = 'pending' AND sla_due_at IS NOT NULL AND sla_due_at <= NOW()`,
  )) {
    await publishEvent({
      type: "workflow.sla_breached", category: "approval",
      entityType: "workflow_task", entityId: t.id, actorId: actor.id, priority: "urgent",
      payload: { instanceId: t.instance_id, recipientId: effective(t),
        title: "Approval past its SLA",
        summary: "An approval assigned to you has passed its SLA.", actionUrl: "/wio-pio" },
      dedupeKey: `workflow.sla_breached:${t.id}`,
    });
    result.breaches++;
    const target = await resolveEscalationTarget(t.instance_id, t.group_no);
    if (target && target !== effective(t)) {
      await publishEvent({
        type: "workflow.escalated", category: "approval",
        entityType: "workflow_task", entityId: t.id, actorId: actor.id, priority: "urgent",
        payload: { instanceId: t.instance_id, recipientId: target,
          title: "Approval escalated after SLA breach",
          summary: "An approval has breached its SLA and been escalated to you.", actionUrl: "/wio-pio" },
        dedupeKey: `workflow.escalated:${t.id}`,
      });
      result.escalations++;
    }
    await writeAudit({
      userId: actor.id, role: actor.accessLevel, action: "WORKFLOW_SLA_BREACH",
      resourceType: "workflows", resourceId: t.instance_id, newValues: { taskId: t.id, escalatedTo: target },
    });
  }

  // 3. Reminders — recurring nudge every reminder_hours while pending.
  for (const t of await query<TaskRow>(
    `SELECT t.id, t.instance_id, t.group_no, t.assignee_user_id, t.delegated_to_user_id
     FROM portal.workflow_tasks t
     JOIN portal.workflow_instances i ON i.id = t.instance_id
     JOIN portal.workflow_groups g ON g.definition_code = i.workflow_code AND g.group_no = t.group_no
     WHERE t.status = 'pending' AND g.reminder_hours IS NOT NULL
       AND COALESCE(t.reminded_at, t.assigned_at) + (g.reminder_hours * INTERVAL '1 hour') <= NOW()`,
  )) {
    await publishEvent({
      type: "workflow.task_reminded", category: "approval",
      entityType: "workflow_task", entityId: t.id, actorId: actor.id,
      payload: { instanceId: t.instance_id, recipientId: effective(t),
        title: "Approval awaiting your decision",
        summary: "Reminder: an approval is awaiting your decision.", actionUrl: "/wio-pio" },
    });
    await query(`UPDATE portal.workflow_tasks SET reminded_at = NOW() WHERE id = $1`, [t.id]);
    result.reminders++;
  }

  // 4. Timeouts — apply the group's declared timeout action.
  const timedOut = await query<TaskRow & { timeout_action: string }>(
    `SELECT t.id, t.instance_id, t.group_no, t.assignee_user_id, t.delegated_to_user_id, g.timeout_action
     FROM portal.workflow_tasks t
     JOIN portal.workflow_instances i ON i.id = t.instance_id AND i.status = 'pending'
     JOIN portal.workflow_groups g ON g.definition_code = i.workflow_code AND g.group_no = t.group_no
     WHERE t.status = 'pending' AND t.timeout_at IS NOT NULL AND t.timeout_at <= NOW()
       AND g.timeout_action IS NOT NULL`,
  );
  for (const t of timedOut) {
    try {
      if (t.timeout_action === "auto_approve") {
        await actOnWorkflow(actor, t.instance_id, "approve", "SLA timeout: auto-approved", t.id);
      } else if (t.timeout_action === "auto_reject") {
        await actOnWorkflow(actor, t.instance_id, "reject", "SLA timeout: auto-rejected", t.id);
      } else if (t.timeout_action === "escalate") {
        await publishEvent({
          type: "workflow.timed_out", category: "approval",
          entityType: "workflow_task", entityId: t.id, actorId: actor.id, priority: "urgent",
          payload: { instanceId: t.instance_id, recipientId: effective(t),
            title: "Approval timed out",
            summary: "An approval has timed out and been escalated.", actionUrl: "/wio-pio" },
          dedupeKey: `workflow.timed_out:${t.id}`,
        });
        const target = await resolveEscalationTarget(t.instance_id, t.group_no);
        if (target && target !== effective(t)) {
          await publishEvent({
            type: "workflow.escalated", category: "approval",
            entityType: "workflow_task", entityId: t.id, actorId: actor.id, priority: "urgent",
            payload: { instanceId: t.instance_id, recipientId: target,
              title: "Timed-out approval escalated to you",
              summary: "A timed-out approval has been escalated to you.", actionUrl: "/wio-pio" },
            dedupeKey: `workflow.escalated:${t.id}`,
          });
        }
      }
      await writeAudit({
        userId: actor.id, role: actor.accessLevel, action: "WORKFLOW_TIMEOUT",
        resourceType: "workflows", resourceId: t.instance_id,
        newValues: { taskId: t.id, action: t.timeout_action },
      });
      result.timeouts++;
    } catch {
      // A timed-out task whose instance already advanced/completed — skip it;
      // the sweep must not wedge on one task.
    }
  }

  return result;
}
