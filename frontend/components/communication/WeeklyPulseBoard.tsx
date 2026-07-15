import type { PulseStatus, WeeklyPulseRow } from "@/lib/services/weekly-pulse";

/**
 * Weekly Pulse board — this week's pulse status for every active project, so the
 * CRM TL and leadership see at a glance which Friday updates are drafted, sent, or
 * still missing (Velocity Gate #2). Read-only; the review + send flow is separate.
 */
export function WeeklyPulseBoard({ rows }: { rows: WeeklyPulseRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-line-strong bg-card px-8 py-16 text-center">
        <p className="font-heading text-2xl text-white">No active projects</p>
        <p className="mt-1 font-body text-sm font-light text-muted">
          Weekly Pulses are drafted for active projects each Friday.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full text-left font-body text-[13.5px]">
        <thead>
          <tr className="bg-surface text-[11px] uppercase tracking-[0.12em] text-secondary">
            <th className="px-4 py-2.5 font-bold">Project</th>
            <th className="px-4 py-2.5 font-bold">Family</th>
            <th className="px-4 py-2.5 font-bold">Stage</th>
            <th className="px-4 py-2.5 font-bold">This week&rsquo;s Pulse</th>
            <th className="px-4 py-2.5 font-bold">Draft</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.projectId} className="border-t border-line bg-card transition-colors hover:bg-hover align-top">
              <td className="px-4 py-2.5 font-bold text-white">{r.projectCode}</td>
              <td className="px-4 py-2.5 font-light text-secondary">{r.familyName}</td>
              <td className="px-4 py-2.5 font-light text-secondary">{r.phase}</td>
              <td className="px-4 py-2.5"><StatusPill status={r.status} /></td>
              <td className="px-4 py-2.5 font-light text-muted">
                {r.draftPreview ? (
                  <span className="line-clamp-2 max-w-md whitespace-pre-line">{r.draftPreview}</span>
                ) : (
                  <span className="text-muted">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const PILL: Record<PulseStatus, { label: string; className: string }> = {
  sent: { label: "Sent", className: "bg-success/10 text-success" },
  reviewed: { label: "Reviewed", className: "bg-warning/10 text-warning" },
  draft: { label: "Draft ready", className: "bg-white/5 text-secondary" },
  missing: { label: "Missing", className: "bg-error/10 text-error" },
};

function StatusPill({ status }: { status: PulseStatus }) {
  const pill = PILL[status];
  return (
    <span className={`rounded-full px-2 py-0.5 font-body text-[10px] font-bold uppercase tracking-wide ${pill.className}`}>
      {pill.label}
    </span>
  );
}
