import { WorkflowDetailView } from "@/components/workflows/WorkflowDetailView";
import { getCurrentUser } from "@/lib/auth/session";
import { query } from "@/lib/db";
import { can } from "@/lib/services/permissions";
import { getWorkflowDetail } from "@/lib/services/workflow-detail";
import { getWorkflowAudit } from "@/lib/services/workflow-audit";
import { invalidId } from "@/lib/api/params";

export const dynamic = "force-dynamic";

/**
 * S19b · Workflow Detail — the main operating screen for one instance. Visible
 * to leadership (read:workflows scope 'all') and to anyone who is a participant
 * on the instance (an approver, delegate or the initiator). The full cross-event
 * Audit tab reads audit.log, which is leadership-only, so it is shown to
 * leadership; a participant sees the timeline and the AI advisory.
 */
export default async function WorkflowDetailPage({ params }: { params: { id: string } }) {
  if (invalidId(params.id)) return <NotAvailable title="Not found" body="That workflow does not exist." />;

  const user = await getCurrentUser();
  const detail = await getWorkflowDetail(user, params.id);
  if (!detail) return <NotAvailable title="Not found" body="That workflow does not exist." />;

  const decision = await can(user, "read", "workflows");
  const isLeadership = decision.allowed && decision.scope === "all";

  if (!isLeadership) {
    const [participant] = await query<{ ok: number }>(
      `SELECT 1 AS ok
       FROM portal.workflow_tasks t
       WHERE t.instance_id = $1 AND (t.assignee_user_id = $2 OR t.delegated_to_user_id = $2)
       UNION
       SELECT 1 FROM portal.workflow_instances WHERE id = $1 AND started_by = $2
       LIMIT 1`,
      [params.id, user.id],
    );
    if (!participant) {
      return (
        <NotAvailable
          title="Not available"
          body="You can view the workflows you take part in, from My Approvals. Org-wide access is for leadership."
        />
      );
    }
  }

  const audit = isLeadership ? await getWorkflowAudit(params.id) : [];

  return <WorkflowDetailView detail={detail} audit={audit} showAudit={isLeadership} />;
}

function NotAvailable({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <div className="mb-6">
        <h1 className="mb-1 font-heading text-4xl text-white">Workflow</h1>
      </div>
      <div className="rounded-lg border border-line bg-card px-6 py-16 text-center">
        <p className="font-heading text-2xl text-white">{title}</p>
        <p className="mt-1 font-body text-sm font-light text-muted">{body}</p>
      </div>
    </div>
  );
}
