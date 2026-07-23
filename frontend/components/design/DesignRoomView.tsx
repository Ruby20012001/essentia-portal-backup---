import type { DesignRoom } from "@/lib/services/design-room";

/**
 * Design Room — the 14-stage Drawing Ladder for one project (read-only).
 * CP → SLD → FI → TP → GFC → AB. Server-rendered; no client interactivity.
 */

const STATUS_META: Record<string, { cls: string; label: string }> = {
  complete: { cls: "bg-success/10 text-success", label: "Complete" },
  pending_approval: { cls: "bg-warning/10 text-warning", label: "Awaiting approval" },
  in_progress: { cls: "bg-white/5 text-secondary", label: "In progress" },
  not_started: { cls: "bg-white/5 text-muted", label: "Not started" },
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function shortDate(iso: string | null): string {
  if (!iso) return "—";
  const [, m, d] = iso.slice(0, 10).split("-");
  return `${d} ${MONTHS[Number(m) - 1] ?? m}`;
}

function statusMeta(status: string) {
  return STATUS_META[status] ?? { cls: "bg-white/5 text-muted", label: status.replace(/_/g, " ") };
}

export function DesignRoomView({ room }: { room: DesignRoom }) {
  const m = room.metrics;
  return (
    <div>
      {/* Metrics */}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-lg border border-line bg-card p-4">
          <p className="font-body text-[11px] font-bold uppercase tracking-[0.12em] text-muted">Stage progress</p>
          <p className="mt-1 font-heading text-2xl text-white">
            {m.complete}<span className="text-muted">/{m.total}</span>
          </p>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/5">
            <div className="h-full bg-success" style={{ width: `${m.percent}%` }} />
          </div>
          <p className="mt-1 font-body text-xs font-light text-muted">{m.percent}% through design</p>
        </div>
        <Card label="Awaiting approval" value={String(m.pendingApprovals)} tone={m.pendingApprovals > 0 ? "text-warning" : "text-white"} sub="drawings pending sign-off" />
        <Card label="Current stage" value={m.currentStageNo != null ? `${m.currentStageNo}/${m.total}` : "—"} sub={m.currentStageName ?? "—"} />
        <Card label="Drawing level" value={m.currentLevel ?? "—"} sub={levelName(m.currentLevel)} />
      </div>

      {/* Ladder */}
      <h2 className="mb-1 font-body text-sm font-bold text-white">14-Stage Design Chart</h2>
      <p className="mb-3 font-body text-xs font-light text-muted">Drawing Ladder: CP → SLD → FI → TP → GFC → AB</p>

      {room.stages.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line-strong bg-card px-5 py-12 text-center font-body text-sm font-light text-muted">
          No design stages recorded for this project yet.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full min-w-[640px] text-left font-body text-[13.5px]">
            <thead>
              <tr className="bg-surface text-[11px] uppercase tracking-[0.12em] text-secondary">
                <th className="px-4 py-2.5 font-bold">#</th>
                <th className="px-4 py-2.5 font-bold">Stage</th>
                <th className="px-4 py-2.5 font-bold">Level</th>
                <th className="px-4 py-2.5 font-bold">Status</th>
                <th className="px-4 py-2.5 font-bold">Date</th>
              </tr>
            </thead>
            <tbody>
              {room.stages.map((s) => {
                const meta = statusMeta(s.status);
                const isCurrent = s.stageNo === m.currentStageNo;
                return (
                  <tr key={s.stageNo} className={`border-t border-line align-top transition-colors hover:bg-hover ${isCurrent ? "bg-hover" : "bg-card"}`}>
                    <td className="px-4 py-2.5 font-bold text-muted">{s.stageNo}</td>
                    <td className="px-4 py-2.5">
                      <span className={isCurrent ? "font-bold text-white" : "font-light text-secondary"}>{s.stageName}</span>
                      {isCurrent ? <span className="ml-2 font-body text-[10px] font-bold uppercase tracking-wide text-secondary">current</span> : null}
                    </td>
                    <td className="px-4 py-2.5">
                      {s.drawingLevel ? (
                        <span className="rounded border border-line-strong px-2 py-0.5 font-body text-[10px] font-bold tracking-wide text-secondary">
                          {s.drawingLevel}
                        </span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`rounded-full px-2 py-0.5 font-body text-[10px] font-bold uppercase tracking-wide ${meta.cls}`}>
                        {meta.label}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 font-light text-muted">
                      {shortDate(s.actualDate ?? s.plannedDate)}
                      {s.actualDate ? null : s.plannedDate ? <span className="text-[10px]"> (planned)</span> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Card({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-line bg-card p-4">
      <p className="font-body text-[11px] font-bold uppercase tracking-[0.12em] text-muted">{label}</p>
      <p className={`mt-1 font-heading text-2xl ${tone ?? "text-white"}`}>{value}</p>
      <p className="mt-1 break-words font-body text-xs font-light text-muted">{sub}</p>
    </div>
  );
}

function levelName(level: string | null): string {
  const map: Record<string, string> = {
    CP: "Concept Plan",
    SLD: "Schematic Level",
    FI: "Finalisation",
    TP: "Tender Package",
    GFC: "Good For Construction",
    AB: "As-Built",
  };
  return level ? map[level] ?? level : "—";
}
