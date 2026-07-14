import { query } from "@/lib/db";
import { computeSlaRisk, type SlaRisk } from "@/lib/services/workflow-advisory";
import { RESOURCE_REF_SQL, RESOURCE_REF_JOINS } from "@/lib/services/workflow-inbox";

/**
 * Approvals oversight — the org-wide, read-only view of every workflow currently
 * in flight, for leadership (COO Operations). Unlike listMyApprovals (personal),
 * this returns ONE row per pending instance: which document, which stage it is
 * waiting at, who it is waiting on, and its SLA position. Read-only by design —
 * leadership observes here; the approve/reject/delegate decisions live on the
 * individual approver's My Approvals inbox.
 *
 * Access is gated by the caller (COO page) to read:workflows scope 'all', i.e.
 * L0/L1 — an org-wide view must not be shown to a dept/record-scoped user.
 */

export type ApprovalOverviewItem = {
  instanceId: string;
  workflowName: string;
  resourceRef: string | null; // friendly document ref, null for demo/placeholder resources
  resourceType: string;
  groupName: string;
  currentStep: number;
  startedAt: string;
  slaDueAt: string | null; // soonest pending deadline in the current group
  pendingCount: number; // approvers still to act in the current group
  quorum: number;
  waitingOn: string | null; // effective approvers (delegate wins), comma-joined
};

export async function listApprovalsOverview(): Promise<ApprovalOverviewItem[]> {
  return query<ApprovalOverviewItem>(
    `SELECT i.id AS "instanceId",
            d.name AS "workflowName",
            ${RESOURCE_REF_SQL} AS "resourceRef",
            i.resource_type AS "resourceType",
            g.name AS "groupName",
            i.current_step AS "currentStep",
            i.started_at::text AS "startedAt",
            tt.sla_due_at AS "slaDueAt",
            tt.pending_count AS "pendingCount",
            g.quorum AS "quorum",
            tt.waiting_on AS "waitingOn"
     FROM portal.workflow_instances i
     JOIN portal.workflow_definitions d ON d.code = i.workflow_code
     JOIN portal.workflow_groups g
       ON g.definition_code = i.workflow_code AND g.group_no = i.current_step${RESOURCE_REF_JOINS}
     CROSS JOIN LATERAL (
       SELECT MIN(t.sla_due_at)::text AS sla_due_at,
              COUNT(*)::int AS pending_count,
              string_agg(DISTINCT COALESCE(du.full_name, au.full_name), ', ') AS waiting_on
       FROM portal.workflow_tasks t
       LEFT JOIN public.users au ON au.id = t.assignee_user_id
       LEFT JOIN public.users du ON du.id = t.delegated_to_user_id
       WHERE t.instance_id = i.id AND t.group_no = i.current_step AND t.status = 'pending'
     ) tt
     WHERE i.status = 'pending' AND tt.pending_count > 0
     ORDER BY tt.sla_due_at NULLS LAST, i.started_at`,
  );
}

export type OverviewCounts = {
  total: number;
  breached: number; // at least one deadline already past
  atRisk: number; // due within 24h (not yet breached)
  noSla: number; // no deadline configured
};

/** Roll the overview items up into the four leadership headline numbers. Pure. */
export function overviewCounts(items: ApprovalOverviewItem[], now: Date): OverviewCounts {
  let breached = 0;
  let atRisk = 0;
  let noSla = 0;
  for (const item of items) {
    const risk = computeSlaRisk(now, [item.slaDueAt]);
    if (risk.level === "breached") breached += 1;
    else if (risk.level === "high" || risk.level === "medium") atRisk += 1;
    else if (risk.level === "none") noSla += 1;
  }
  return { total: items.length, breached, atRisk, noSla };
}

/** Per-item SLA read, reusing the deterministic advisory risk model. Pure. */
export function itemSlaRisk(item: ApprovalOverviewItem, now: Date): SlaRisk {
  return computeSlaRisk(now, [item.slaDueAt]);
}
