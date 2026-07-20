import type { SettledWorkflowItem } from "@/lib/services/workflow-oversight";

/**
 * Finished workflows — the dashboard's "completed" and "recently rejected"
 * sections. Compact table (the operating detail lives on the running cards);
 * reuses the portal's existing table treatment.
 */
export function SettledWorkflows({
  items,
  emptyLabel,
}: {
  items: SettledWorkflowItem[];
  emptyLabel: string;
}) {
  if (items.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-line-strong bg-card px-5 py-8 text-center font-body text-sm font-light text-muted">
        {emptyLabel}
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full text-left font-body text-[13.5px]">
        <thead>
          <tr className="bg-surface text-[11px] uppercase tracking-[0.12em] text-secondary">
            <th className="px-4 py-2.5 font-bold">Workflow</th>
            <th className="px-4 py-2.5 font-bold">Document</th>
            <th className="px-4 py-2.5 font-bold">Outcome</th>
            <th className="px-4 py-2.5 font-bold">Decided by</th>
            <th className="px-4 py-2.5 font-bold">Completed</th>
          </tr>
        </thead>
        <tbody>
          {items.map((w) => (
            <tr key={w.instanceId} className="border-t border-line bg-card transition-colors hover:bg-hover">
              <td className="px-4 py-2.5 font-light text-white">{w.workflowName}</td>
              <td className="px-4 py-2.5 font-bold text-white">{w.resourceRef ?? "—"}</td>
              <td className="px-4 py-2.5">
                <OutcomePill status={w.status} />
              </td>
              <td className="px-4 py-2.5 font-light text-secondary">{w.decidedBy ?? "—"}</td>
              <td className="px-4 py-2.5 font-light text-muted">
                {w.completedAt ? w.completedAt.slice(0, 16).replace("T", " ") : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const PILL: Record<SettledWorkflowItem["status"], { label: string; className: string }> = {
  approved: { label: "Approved", className: "bg-success/10 text-success" },
  rejected: { label: "Rejected", className: "bg-error/10 text-error" },
  cancelled: { label: "Cancelled", className: "bg-white/5 text-muted" },
};

function OutcomePill({ status }: { status: SettledWorkflowItem["status"] }) {
  const pill = PILL[status];
  return (
    <span className={`rounded-full px-2 py-0.5 font-body text-[10px] font-bold uppercase tracking-wide ${pill.className}`}>
      {pill.label}
    </span>
  );
}
