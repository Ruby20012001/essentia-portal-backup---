import { SlaMonitor, type RiskItem } from "@/components/workflows/SlaMonitor";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/services/permissions";
import { getSlaMonitorCounts, getSlaTrend } from "@/lib/services/workflow-sla-monitor";
import { listApprovalsOverview, itemSlaRisk } from "@/lib/services/workflow-oversight";

export const dynamic = "force-dynamic";

/**
 * S22 · SLA Monitor (screen 8). Org-wide health of workflow deadlines — the
 * approaching / breached / escalated / timed-out counts, a 14-day warning &
 * breach trend, and every in-flight item ranked by SLA risk. Read-only; gated
 * on read:workflows scope 'all' (leadership), the same authority as the COO
 * oversight and Dashboard. Acting still happens on My Approvals.
 */
export default async function SlaMonitorPage() {
  const user = await getCurrentUser();
  const decision = await can(user, "read", "workflows");

  return (
    <div>
      <div className="mb-6">
        <h1 className="mb-1 font-heading text-4xl text-white">SLA Monitor</h1>
        <p className="font-body text-sm font-light text-muted">
          Where workflow deadlines stand across the organisation — what is approaching, what has
          breached, and which decisions are overdue right now.
        </p>
      </div>

      {!decision.allowed || decision.scope !== "all" ? (
        <div className="rounded-lg border border-line bg-card px-6 py-16 text-center">
          <p className="font-heading text-2xl text-white">Leadership view</p>
          <p className="mt-1 font-body text-sm font-light text-muted">
            The org-wide SLA monitor is available to leadership. You can see the workflows you take part
            in from My Approvals.
          </p>
        </div>
      ) : (
        <Monitor />
      )}
    </div>
  );
}

async function Monitor() {
  const now = new Date();
  const [counts, trend, overview] = await Promise.all([
    getSlaMonitorCounts(),
    getSlaTrend(14),
    listApprovalsOverview(),
  ]);

  const items: RiskItem[] = overview.map((o) => {
    const risk = itemSlaRisk(o, now);
    return {
      instanceId: o.instanceId,
      workflowName: o.workflowName,
      resourceRef: o.resourceRef,
      resourceType: o.resourceType,
      groupName: o.groupName,
      pendingCount: o.pendingCount,
      quorum: o.quorum,
      startedAt: o.startedAt,
      startedBy: o.startedBy,
      waitingOn: o.waitingOn,
      slaDueAt: o.slaDueAt,
      riskLevel: risk.level,
      hoursRemaining: risk.hoursRemaining,
    };
  });

  return <SlaMonitor counts={counts} trend={trend} items={items} />;
}
