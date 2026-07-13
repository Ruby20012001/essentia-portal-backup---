import { query } from "@/lib/db";
import type { SessionUser } from "@/lib/auth/session";
import { RESOURCE_REF_SQL, RESOURCE_REF_JOINS } from "@/lib/services/workflow-inbox";

/**
 * Workflow timeline — the full approval chain for one instance: every group,
 * its state (done / current / skipped / upcoming), the approvers and what they
 * did, plus the immutable action history. Read-only.
 */

export type TimelineApprover = {
  name: string;
  status: string | null; // task status, or null when the group is upcoming
  delegatedTo: string | null;
  actedBy: string | null;
  actedAt: string | null;
};

export type TimelineGroup = {
  groupNo: number;
  name: string;
  quorum: number;
  state: "done" | "current" | "skipped" | "upcoming";
  approvers: TimelineApprover[];
};

export type WorkflowDetail = {
  instanceId: string;
  workflowName: string;
  resourceRef: string | null;
  status: string;
  currentGroup: number;
  groups: TimelineGroup[];
  history: Array<{ action: string; groupNo: number | null; actor: string | null; comments: string | null; at: string }>;
};

export async function getWorkflowDetail(_user: SessionUser, instanceId: string): Promise<WorkflowDetail | null> {
  const [inst] = await query<{
    workflow_code: string;
    workflow_name: string;
    resource_ref: string | null;
    status: string;
    current_step: number;
  }>(
    `SELECT i.workflow_code, d.name AS workflow_name, ${RESOURCE_REF_SQL} AS resource_ref,
            i.status, i.current_step
     FROM portal.workflow_instances i
     JOIN portal.workflow_definitions d ON d.code = i.workflow_code${RESOURCE_REF_JOINS}
     WHERE i.id = $1`,
    [instanceId],
  );
  if (!inst) return null;

  const groups = await query<{ group_no: number; name: string; quorum: number }>(
    `SELECT group_no, name, quorum FROM portal.workflow_groups
     WHERE definition_code = $1 ORDER BY group_no`,
    [inst.workflow_code],
  );
  const hints = await query<{ group_no: number; approver_hint: string | null }>(
    `SELECT g.group_no, ga.approver_hint
     FROM portal.workflow_group_approvers ga
     JOIN portal.workflow_groups g ON g.id = ga.group_id
     WHERE g.definition_code = $1 ORDER BY g.group_no, ga.sort_order`,
    [inst.workflow_code],
  );
  const tasks = await query<{
    group_no: number;
    status: string;
    acted_at: string | null;
    assignee_name: string;
    delegate_name: string | null;
    acted_by_name: string | null;
  }>(
    `SELECT t.group_no, t.status, t.acted_at::text AS acted_at,
            a.full_name AS assignee_name, dt.full_name AS delegate_name, ab.full_name AS acted_by_name
     FROM portal.workflow_tasks t
     JOIN public.users a ON a.id = t.assignee_user_id
     LEFT JOIN public.users dt ON dt.id = t.delegated_to_user_id
     LEFT JOIN public.users ab ON ab.id = t.acted_by
     WHERE t.instance_id = $1 ORDER BY t.group_no`,
    [instanceId],
  );
  const history = await query<{ action: string; group_no: number | null; comments: string | null; acted_at: string; actor_name: string | null }>(
    `SELECT wa.action, wa.step_no AS group_no, wa.comments, wa.acted_at::text AS acted_at, u.full_name AS actor_name
     FROM portal.workflow_actions wa
     LEFT JOIN public.users u ON u.id = wa.acted_by
     WHERE wa.instance_id = $1 ORDER BY wa.acted_at`,
    [instanceId],
  );

  const timelineGroups: TimelineGroup[] = groups.map((g) => {
    const gTasks = tasks.filter((t) => t.group_no === g.group_no);
    let state: TimelineGroup["state"];
    if (g.group_no === inst.current_step && inst.status === "pending") state = "current";
    else if (g.group_no < inst.current_step || inst.status !== "pending") {
      state = gTasks.some((t) => t.status === "approved") ? "done" : gTasks.length === 0 ? "skipped" : "done";
    } else state = "upcoming";

    const approvers: TimelineApprover[] = gTasks.length
      ? gTasks.map((t) => ({
          name: t.assignee_name,
          status: t.status,
          delegatedTo: t.delegate_name,
          actedBy: t.acted_by_name,
          actedAt: t.acted_at,
        }))
      : hints
          .filter((h) => h.group_no === g.group_no)
          .map((h) => ({ name: h.approver_hint ?? "Assigned approver", status: null, delegatedTo: null, actedBy: null, actedAt: null }));

    return { groupNo: g.group_no, name: g.name, quorum: g.quorum, state, approvers };
  });

  return {
    instanceId,
    workflowName: inst.workflow_name,
    resourceRef: inst.resource_ref,
    status: inst.status,
    currentGroup: inst.current_step,
    groups: timelineGroups,
    history: history.map((h) => ({ action: h.action, groupNo: h.group_no, actor: h.actor_name, comments: h.comments, at: h.acted_at })),
  };
}
