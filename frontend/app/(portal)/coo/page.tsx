import { MetricCard } from "@/components/dashboard/MetricCard";
import { ApprovalsOverviewTable } from "@/components/coo/ApprovalsOverviewTable";
import { ArAgeingTable, MorningNumbers, VerticalHealthStrip } from "@/components/coo/CooMorning";
import { getCurrentUser, type SessionUser } from "@/lib/auth/session";
import { getCooMorning } from "@/lib/services/coo-morning";
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
          The four morning numbers, the health of every vertical, AR ageing, and every approval in flight.
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
        <Oversight user={user} />
      )}
    </div>
  );
}

async function Oversight({ user }: { user: SessionUser }) {
  const now = new Date();
  const [items, morning] = await Promise.all([listApprovalsOverview(), getCooMorning(user, now)]);
  const counts = overviewCounts(items, now);

  return (
    <>
      <section className="mb-10">
        <h2 className="mb-3 font-heading text-2xl text-white">The morning numbers</h2>
        <MorningNumbers numbers={morning.numbers} />
      </section>

      <section className="mb-10">
        <h2 className="mb-3 font-heading text-2xl text-white">Cross-vertical health</h2>
        <VerticalHealthStrip health={morning.health} />
      </section>

      <section className="mb-10">
        <h2 className="mb-1 font-heading text-2xl text-white">AR ageing</h2>
        <p className="mb-3 font-body text-xs font-light text-muted">
          Raised invoices unpaid past 30 days, oldest first. Follow up at 45 days, escalate at 60.
        </p>
        <ArAgeingTable invoices={morning.invoices} />
      </section>

      <h2 className="mb-3 font-heading text-2xl text-white">Approvals in flight</h2>
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard label="In flight" value={String(counts.total)} />
        <MetricCard label="SLA breached" value={String(counts.breached)} sub="past deadline" />
        <MetricCard label="At risk" value={String(counts.atRisk)} sub="due within 24h" />
        <MetricCard label="No SLA" value={String(counts.noSla)} sub="untimed" />
      </div>

      <section>
        <ApprovalsOverviewTable items={items} now={now} />
      </section>
    </>
  );
}
