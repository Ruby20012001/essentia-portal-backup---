import { MetricCard } from "@/components/dashboard/MetricCard";
import { WorkflowDashboard } from "@/components/workflows/WorkflowDashboard";
import { SettledWorkflows } from "@/components/workflows/SettledWorkflows";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/services/permissions";
import {
  itemSlaRisk,
  listApprovalsOverview,
  listSettledWorkflows,
} from "@/lib/services/workflow-oversight";
import { listMyApprovals } from "@/lib/services/workflow-inbox";

export const dynamic = "force-dynamic";

/**
 * S19 · Workflow Dashboard — every workflow in flight across the organisation.
 * Org-wide, so it is gated to read:workflows scope 'all' (L0/L1), the same
 * fencing as COO Operations; a dept/record-scoped user is sent to My Approvals.
 *
 * Reads existing services only (listApprovalsOverview / listMyApprovals /
 * itemSlaRisk) — no new backend. Completed and rejected workflows are NOT shown
 * because no query returns them; that gap is reported rather than faked.
 */
export default async function WorkflowsPage() {
  const user = await getCurrentUser();
  const decision = await can(user, "read", "workflows");
  const isLeadership = decision.allowed && decision.scope === "all";

  return (
    <div>
      <div className="mb-6">
        <h1 className="mb-1 font-heading text-4xl text-white">Workflows</h1>
        <p className="font-body text-sm font-light text-muted">
          Every approval in flight — where it sits, who owes the decision, and how its SLA is running.
        </p>
      </div>

      {!isLeadership ? (
        <div className="rounded-lg border border-line bg-card px-6 py-16 text-center">
          <p className="font-heading text-2xl text-white">Leadership view</p>
          <p className="mt-1 font-body text-sm font-light text-muted">
            The org-wide workflow dashboard is available to leadership (L0–L1). Your own pending
            decisions are on My Approvals.
          </p>
        </div>
      ) : (
        <Board user={user} />
      )}
    </div>
  );
}

async function Board({ user }: { user: Parameters<typeof listMyApprovals>[0] }) {
  const now = new Date();
  const [running, mine, completed, rejected] = await Promise.all([
    listApprovalsOverview(),
    listMyApprovals(user),
    listSettledWorkflows(["approved"], 10),
    listSettledWorkflows(["rejected", "cancelled"], 10),
  ]);

  const risks = running.map((r) => itemSlaRisk(r, now));
  const breached = risks.filter((r) => r.level === "breached").length;
  const warning = risks.filter((r) => r.level === "high" || r.level === "medium").length;

  return (
    <>
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard label="Running" value={String(running.length)} sub="in flight" />
        <MetricCard label="My approvals" value={String(mine.length)} sub="awaiting me" />
        <MetricCard label="SLA warnings" value={String(warning)} sub="due within 24h" />
        <MetricCard label="SLA breached" value={String(breached)} sub="past deadline" />
      </div>

      <section className="mb-10">
        <h2 className="mb-3 font-heading text-2xl text-white">Running workflows</h2>
        <WorkflowDashboard running={running} now={now} />
      </section>

      <section className="mb-10">
        <h2 className="mb-3 font-heading text-2xl text-white">Recently completed</h2>
        <SettledWorkflows items={completed} emptyLabel="No workflow has completed yet." />
      </section>

      <section>
        <h2 className="mb-3 font-heading text-2xl text-white">Recently rejected</h2>
        <SettledWorkflows items={rejected} emptyLabel="Nothing has been rejected." />
      </section>
    </>
  );
}
