import { itemSlaRisk, type ApprovalOverviewItem } from "@/lib/services/workflow-oversight";

/**
 * Read-only org-wide approvals table for the COO Operations screen. One row per
 * in-flight workflow: document, stage, who it waits on, SLA and age. Styling only
 * — no actions here (approve/reject/delegate live on My Approvals). Dark theme.
 */
export function ApprovalsOverviewTable({
  items,
  now,
}: {
  items: ApprovalOverviewItem[];
  now: Date;
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-line-strong bg-card px-8 py-16 text-center">
        <p className="font-heading text-2xl text-white">Nothing in flight</p>
        <p className="mt-1 font-body text-sm font-light text-muted">
          No workflows are awaiting approval across the organisation right now.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full text-left font-body text-[13.5px]">
        <thead>
          <tr className="bg-surface text-[11px] uppercase tracking-[0.12em] text-secondary">
            <th className="px-4 py-2.5 font-bold">Workflow</th>
            <th className="px-4 py-2.5 font-bold">Document</th>
            <th className="px-4 py-2.5 font-bold">Stage</th>
            <th className="px-4 py-2.5 font-bold">Waiting on</th>
            <th className="px-4 py-2.5 font-bold">SLA</th>
            <th className="px-4 py-2.5 font-bold">Age</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const sla = slaLabel(item, now);
            return (
              <tr
                key={item.instanceId}
                className="border-t border-line bg-card transition-colors hover:bg-hover"
              >
                <td className="px-4 py-2.5 font-light text-white">{item.workflowName}</td>
                <td className="px-4 py-2.5 font-bold text-white">{item.resourceRef ?? "—"}</td>
                <td className="px-4 py-2.5 font-light text-secondary">
                  {item.groupName}
                  {item.quorum > 1 ? (
                    <span className="text-muted"> · {item.pendingCount} awaiting</span>
                  ) : null}
                </td>
                <td className="px-4 py-2.5 font-light text-secondary">{item.waitingOn ?? "—"}</td>
                <td className="px-4 py-2.5">
                  <span className={`font-body text-xs ${sla.tone}`}>{sla.text}</span>
                </td>
                <td className="px-4 py-2.5 font-light text-muted">{ageLabel(item.startedAt, now)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function slaLabel(item: ApprovalOverviewItem, now: Date): { text: string; tone: string } {
  const risk = itemSlaRisk(item, now);
  if (risk.level === "none") return { text: "No SLA", tone: "text-muted" };
  if (risk.level === "breached") return { text: "Breached", tone: "font-bold text-error" };
  const h = risk.hoursRemaining ?? 0;
  if (risk.level === "high") return { text: `Due in ${Math.round(h)}h`, tone: "text-error" };
  if (risk.level === "medium") return { text: `Due in ${Math.round(h)}h`, tone: "text-warning" };
  return { text: `Due in ${Math.round(h)}h`, tone: "text-success" };
}

function ageLabel(startedAt: string, now: Date): string {
  const ms = now.getTime() - new Date(startedAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const days = Math.floor(ms / 86_400_000);
  if (days >= 1) return `${days}d`;
  const hours = Math.floor(ms / 3_600_000);
  if (hours >= 1) return `${hours}h`;
  const mins = Math.floor(ms / 60_000);
  return `${mins}m`;
}
