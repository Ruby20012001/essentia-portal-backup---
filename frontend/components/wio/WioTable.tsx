"use client";

import { RagDot } from "@/components/dashboard/RagDot";
import { ToggleChip } from "@/components/wio/ToggleChip";
import type { Wio } from "@/lib/services/wio";

/**
 * The conversion clock (Brief §30). Checklist chips PATCH live; Convert is
 * always pressable — an incomplete checklist returns the exact blocking
 * message rather than a silently disabled button.
 */
export function WioTable({
  wios,
  busyId,
  onPatch,
  onConvert,
  onRequestApproval,
}: {
  wios: Wio[];
  busyId: string | null;
  onPatch: (
    wio: Wio,
    patch: Partial<
      Record<"boqApproved" | "design3dApproved" | "sldApproved", boolean>
    >,
  ) => void;
  onConvert: (wio: Wio) => void;
  onRequestApproval: (wio: Wio) => void;
}) {
  if (wios.length === 0) {
    return (
      <p className="font-body text-sm font-light text-label">
        No open WIOs — every initiated work order has converted.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full text-left font-body text-[13.5px]">
        <thead>
          <tr className="bg-surface text-[11px] uppercase tracking-[0.12em] text-secondary">
            <th className="px-4 py-2.5 font-bold">WIO</th>
            <th className="px-4 py-2.5 font-bold">Project</th>
            <th className="px-4 py-2.5 font-bold">Dept</th>
            <th className="px-4 py-2.5 font-bold">Clock</th>
            <th className="px-4 py-2.5 font-bold">Checklist (all 3 before PIO)</th>
            <th className="px-4 py-2.5 font-bold"></th>
          </tr>
        </thead>
        <tbody>
          {wios.map((wio) => {
            const busy = busyId === wio.id;
            return (
              <tr key={wio.id} className="border-t border-line bg-card transition-colors hover:bg-hover">
                <td className="px-4 py-2.5 font-bold text-ink">{wio.wioNumber}</td>
                <td className="px-4 py-2.5 font-light text-ink">
                  {wio.projectCode}
                  <span className="text-label"> · {wio.familyName}</span>
                </td>
                <td className="px-4 py-2.5 font-light text-label">{wio.department}</td>
                <td className="px-4 py-2.5">
                  <span className="inline-flex items-center gap-2">
                    <RagDot rag={wio.clockRag} />
                    <span
                      className={
                        wio.isOverdue ? "font-bold text-alert" : "font-light text-ink"
                      }
                    >
                      {wio.isOverdue
                        ? `${Math.abs(wio.daysRemaining)}d overdue`
                        : `${wio.daysRemaining}d left`}
                    </span>
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  <span className="inline-flex flex-wrap gap-1.5">
                    <ToggleChip
                      label="BOQ"
                      checked={wio.boqApproved}
                      disabled={busy}
                      onToggle={() => onPatch(wio, { boqApproved: !wio.boqApproved })}
                    />
                    <ToggleChip
                      label="3D"
                      checked={wio.design3dApproved}
                      disabled={busy}
                      onToggle={() =>
                        onPatch(wio, { design3dApproved: !wio.design3dApproved })
                      }
                    />
                    <ToggleChip
                      label="SLD"
                      checked={wio.sldApproved}
                      disabled={busy}
                      onToggle={() => onPatch(wio, { sldApproved: !wio.sldApproved })}
                    />
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right">
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onRequestApproval(wio)}
                      className="whitespace-nowrap rounded border border-line-strong bg-canvas px-3 py-1.5 font-body text-xs font-bold text-secondary transition-colors hover:bg-hover disabled:opacity-50"
                    >
                      {busy ? "…" : "Send for GFC approval"}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onConvert(wio)}
                      className={`whitespace-nowrap rounded px-3 py-1.5 font-body text-xs font-bold transition-colors disabled:opacity-50 ${
                        wio.checklistComplete
                          ? "bg-forest text-white hover:bg-forest/90"
                          : "border border-line-strong bg-canvas text-secondary hover:bg-hover"
                      }`}
                    >
                      {busy ? "…" : "Convert to PIO"}
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
