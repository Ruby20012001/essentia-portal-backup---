"use client";

import { RagDot } from "@/components/dashboard/RagDot";
import { ToggleChip } from "@/components/wio/ToggleChip";
import type { Pio } from "@/lib/services/pio";

/**
 * The production clock (Brief §29). Triangle chips PATCH live; "Send for
 * approval" enforces the Triangle gate server-side, and approval state
 * comes from the workflow engine (Khushpreet → Deepak Ji → Hardesh).
 */
export function PioTable({
  pios,
  busyId,
  onPatch,
  onRequestApproval,
  onAct,
}: {
  pios: Pio[];
  busyId: string | null;
  onPatch: (
    pio: Pio,
    patch: Partial<
      Record<
        "finalBoqSigned" | "final3dSigned" | "gfcSignedByClient" | "bomShared",
        boolean
      >
    >,
  ) => void;
  onRequestApproval: (pio: Pio) => void;
  onAct: (pio: Pio, action: "approve" | "reject") => void;
}) {
  if (pios.length === 0) {
    return (
      <p className="font-body text-sm font-light text-label">
        No live PIOs — convert a WIO to start the production clock.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full text-left font-body text-[13.5px]">
        <thead>
          <tr className="bg-surface text-[11px] uppercase tracking-[0.12em] text-secondary">
            <th className="px-4 py-2.5 font-bold">PIO</th>
            <th className="px-4 py-2.5 font-bold">Project</th>
            <th className="px-4 py-2.5 font-bold">Production clock</th>
            <th className="px-4 py-2.5 font-bold">Triangle of Agreement (all 4)</th>
            <th className="px-4 py-2.5 font-bold">Approval — §26 chain</th>
          </tr>
        </thead>
        <tbody>
          {pios.map((pio) => {
            const busy = busyId === pio.id;
            return (
              <tr key={pio.id} className="border-t border-line bg-card transition-colors hover:bg-hover">
                <td className="px-4 py-2.5 font-bold text-ink">{pio.pioNumber}</td>
                <td className="px-4 py-2.5 font-light text-ink">
                  {pio.projectCode}
                  {pio.projectName ? (
                    <span className="text-label"> · {pio.projectName}</span>
                  ) : null}
                </td>
                <td className="px-4 py-2.5">
                  <span className="inline-flex items-center gap-2">
                    <RagDot rag={pio.clockRag} />
                    <span className="font-light text-ink">
                      {pio.daysRemaining === null
                        ? "—"
                        : `${pio.daysRemaining}d left`}
                    </span>
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  <span className="inline-flex flex-wrap gap-1.5">
                    <ToggleChip
                      label="Final BOQ"
                      checked={pio.finalBoqSigned}
                      disabled={busy}
                      onToggle={() =>
                        onPatch(pio, { finalBoqSigned: !pio.finalBoqSigned })
                      }
                    />
                    <ToggleChip
                      label="Final 3D"
                      checked={pio.final3dSigned}
                      disabled={busy}
                      onToggle={() =>
                        onPatch(pio, { final3dSigned: !pio.final3dSigned })
                      }
                    />
                    <ToggleChip
                      label="GFC signed"
                      checked={pio.gfcSignedByClient}
                      disabled={busy}
                      onToggle={() =>
                        onPatch(pio, { gfcSignedByClient: !pio.gfcSignedByClient })
                      }
                    />
                    <ToggleChip
                      label="BOM shared"
                      checked={pio.bomShared}
                      disabled={busy}
                      onToggle={() => onPatch(pio, { bomShared: !pio.bomShared })}
                    />
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  {!pio.approval ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onRequestApproval(pio)}
                      className="rounded border border-line-strong bg-canvas px-3 py-1.5 font-body text-xs font-bold text-white transition-colors hover:bg-hover disabled:opacity-50"
                    >
                      {busy ? "…" : "Send for approval"}
                    </button>
                  ) : pio.approval.status === "pending" ? (
                    <span className="inline-flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-navy/40 bg-navy/5 px-2.5 py-0.5 font-body text-[11px] font-bold text-navy">
                        Step {pio.approval.currentStep}/{pio.approval.totalSteps} ·{" "}
                        {pio.approval.approverHint ?? pio.approval.stepName}
                      </span>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onAct(pio, "approve")}
                        className="rounded border border-forest px-2.5 py-1 font-body text-[11px] font-bold text-forest hover:bg-forest/10 disabled:opacity-50"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onAct(pio, "reject")}
                        className="rounded border border-alert px-2.5 py-1 font-body text-[11px] font-bold text-alert hover:bg-alert/10 disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </span>
                  ) : (
                    <span
                      className={`rounded-full px-2.5 py-0.5 font-body text-[11px] font-bold ${
                        pio.approval.status === "approved"
                          ? "bg-forest/10 text-forest"
                          : "bg-alert/10 text-alert"
                      }`}
                    >
                      {pio.approval.status}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
