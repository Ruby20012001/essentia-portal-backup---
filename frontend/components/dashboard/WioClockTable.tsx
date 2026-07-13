import { RagDot } from "@/components/dashboard/RagDot";
import type { WioClockRow } from "@/lib/services/dashboard";

/** WIO conversion clock — Brief §29-30: every WIO converts to PIO in 15 days. */
export function WioClockTable({ rows }: { rows: WioClockRow[] }) {
  if (rows.length === 0) {
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
            <th className="px-4 py-2.5 font-bold">Family</th>
            <th className="px-4 py-2.5 font-bold">Dept</th>
            <th className="px-4 py-2.5 font-bold">Clock</th>
            <th className="px-4 py-2.5 font-bold">Checklist</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.wioNumber} className="border-t border-line bg-card transition-colors hover:bg-hover">
              <td className="px-4 py-2.5 font-bold text-ink">
                {row.wioNumber}
              </td>
              <td className="px-4 py-2.5 font-light text-ink">
                {row.projectCode}
              </td>
              <td className="px-4 py-2.5 font-light text-ink">
                {row.familyName}
              </td>
              <td className="px-4 py-2.5 font-light text-label">
                {row.department}
              </td>
              <td className="px-4 py-2.5">
                <span className="inline-flex items-center gap-2">
                  <RagDot rag={row.clockRag} />
                  <span
                    className={
                      row.isOverdue
                        ? "font-bold text-alert"
                        : "font-light text-ink"
                    }
                  >
                    {row.isOverdue
                      ? `${Math.abs(row.daysRemaining)}d overdue`
                      : `${row.daysRemaining}d left`}
                  </span>
                </span>
              </td>
              <td className="px-4 py-2.5">
                {row.checklistComplete ? (
                  <span className="font-bold text-forest">Complete</span>
                ) : (
                  <span className="font-light text-label">Pending</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
