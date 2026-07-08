import { RagDot } from "@/components/dashboard/RagDot";
import { formatINR, formatPhase } from "@/lib/format";
import type { ProjectRiskRow } from "@/lib/services/dashboard";

/** Active projects sorted by risk (red first), then AR outstanding. */
export function ProjectRiskTable({ rows }: { rows: ProjectRiskRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="font-body text-sm font-light text-label">
        No active projects are visible to you yet.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full text-left font-body text-[13.5px]">
        <thead>
          <tr className="bg-espresso text-[11px] uppercase tracking-[0.12em] text-[#EDE6DC]">
            <th className="px-4 py-2.5 font-bold">Code</th>
            <th className="px-4 py-2.5 font-bold">Project · Family</th>
            <th className="px-4 py-2.5 font-bold">Phase</th>
            <th className="px-4 py-2.5 font-bold">Health</th>
            <th className="px-4 py-2.5 font-bold">AR Outstanding</th>
            <th className="px-4 py-2.5 font-bold">Target DoR</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.projectCode} className="border-t border-line bg-paper">
              <td className="px-4 py-2.5 font-bold text-ink">
                {row.projectCode}
              </td>
              <td className="px-4 py-2.5 font-light text-ink">
                {row.projectName ?? "—"}
                {row.familyName ? (
                  <span className="text-label"> · {row.familyName}</span>
                ) : null}
              </td>
              <td className="px-4 py-2.5 font-light text-ink">
                {formatPhase(row.phase)}
              </td>
              <td className="px-4 py-2.5">
                <span className="inline-flex items-center gap-2">
                  <RagDot rag={row.ragStatus} />
                  <span className="font-light capitalize text-ink">
                    {row.ragStatus}
                  </span>
                </span>
              </td>
              <td
                className={`px-4 py-2.5 ${
                  row.arOutstanding > 0
                    ? "font-bold text-amber-deep"
                    : "font-light text-label"
                }`}
              >
                {formatINR(row.arOutstanding)}
              </td>
              <td className="px-4 py-2.5 font-light text-label">
                {row.targetDor ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
