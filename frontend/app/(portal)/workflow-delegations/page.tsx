import { ActiveDelegations } from "@/components/workflows/ActiveDelegations";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/services/permissions";
import { listAllDelegations } from "@/lib/services/workflow-delegations";

export const dynamic = "force-dynamic";

/**
 * S21 · Active Delegations (admin, screen 7). The org-wide register of standing
 * workflow delegations, with monitoring and revocation. Gated on assign:workflows
 * — the same authority the revoke endpoint requires — so the screen never shows
 * an action the API would refuse. Read-only apart from the existing revoke.
 */
export default async function ActiveDelegationsPage() {
  const user = await getCurrentUser();
  const decision = await can(user, "assign", "workflows");

  return (
    <div>
      <div className="mb-6">
        <h1 className="mb-1 font-heading text-4xl text-white">Active Delegations</h1>
        <p className="font-body text-sm font-light text-muted">
          Every standing delegation across the organisation — who is covering for whom, over what, and
          until when. Revoking one routes new approvals back to the original approver.
        </p>
      </div>

      {!decision.allowed || decision.scope !== "all" ? (
        <div className="rounded-lg border border-line bg-card px-6 py-16 text-center">
          <p className="font-heading text-2xl text-white">Administrator view</p>
          <p className="mt-1 font-body text-sm font-light text-muted">
            Monitoring and revoking delegations across the organisation is restricted to leadership and
            platform administrators.
          </p>
        </div>
      ) : (
        <ActiveDelegations initial={await listAllDelegations()} />
      )}
    </div>
  );
}
