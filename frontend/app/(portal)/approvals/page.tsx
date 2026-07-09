import { ApprovalsInbox } from "@/components/approvals/ApprovalsInbox";
import { getCurrentUser } from "@/lib/auth/session";
import { listMyApprovals } from "@/lib/services/workflow-inbox";

export const dynamic = "force-dynamic";

/** My Approvals — the approver's inbox, surfacing the whole workflow engine. */
export default async function ApprovalsPage() {
  const user = await getCurrentUser();
  const approvals = await listMyApprovals(user);

  return (
    <div>
      <div className="mb-6">
        <h1 className="mb-1 font-heading text-4xl text-espresso">My Approvals</h1>
        <p className="font-body text-sm font-light text-label">
          Your pending decisions across every workflow — approve, reject, or delegate,
          with SLA and advisory at a glance.
        </p>
      </div>
      <ApprovalsInbox initial={approvals} />
    </div>
  );
}
