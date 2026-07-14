import { MetricCard } from "@/components/dashboard/MetricCard";
import { ApprovalsOverviewTable } from "@/components/coo/ApprovalsOverviewTable";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/services/permissions";
import { listApprovalsOverview, overviewCounts } from "@/lib/services/workflow-oversight";

export const dynamic = "force-dynamic";

/**
 * S8 · COO Operations — leadership approvals oversight. Org-wide, read-only view
 * of every workflow in flight: where it is stuck, who owns the next decision, and
 * its SLA position. Gated to read:workflows scope 'all' (L0/L1); a dept/record-
 * scoped user cannot see an org-wide roll-up. No actions here by design.
 */
export default async function CooPage() {
  const user = await getCurrentUser();
  const decision = await can(user, "read", "workflows");
  const isLeadership = decision.allowed && decision.scope === "all";

  return (
    <div>
      <div className="mb-6">
        <h1 className="mb-1 font-heading text-4xl text-white">COO Operations</h1>
        <p className="font-body text-sm font-light text-muted">
          Cross-vertical approvals oversight — every workflow in flight, where it waits, and its SLA.
        </p>
      </div>

      {!isLeadership ? (
        <div className="rounded-lg border border-line bg-card px-6 py-16 text-center">
          <p className="font-heading text-2xl text-white">Leadership view</p>
          <p className="mt-1 font-body text-sm font-light text-muted">
            The org-wide approvals oversight is available to leadership (L0–L1). Your own pending
            decisions are on My Approvals.
          </p>
        </div>
      ) : (
        <Oversight />
      )}
    </div>
  );
}

async function Oversight() {
  const now = new Date();
  const items = await listApprovalsOverview();
  const counts = overviewCounts(items, now);

  return (
    <>
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard label="In flight" value={String(counts.total)} />
        <MetricCard label="SLA breached" value={String(counts.breached)} sub="past deadline" />
        <MetricCard label="At risk" value={String(counts.atRisk)} sub="due within 24h" />
        <MetricCard label="No SLA" value={String(counts.noSla)} sub="untimed" />
      </div>

      <section>
        <h2 className="mb-3 font-heading text-2xl text-white">Awaiting approval</h2>
        <ApprovalsOverviewTable items={items} now={now} />
      </section>
    </>
  );
}
