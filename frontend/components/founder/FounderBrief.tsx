import type { BriefNumber, BriefStatus } from "@/lib/services/founder-brief";

/**
 * The Founder Morning Brief — the 7 numbers, read-only, each with a
 * threshold-derived status so it reads in the 7-minute test. Below: the four
 * questions the portal answers so a founder never has to ask them. Dark theme.
 */
export function FounderBrief({ numbers }: { numbers: BriefNumber[] }) {
  return (
    <div>
      <ol className="overflow-hidden rounded-lg border border-line">
        {numbers.map((num, i) => (
          <li
            key={num.n}
            className={`flex items-start gap-4 px-5 py-4 transition-colors hover:bg-hover ${
              i > 0 ? "border-t border-line" : ""
            } bg-card`}
          >
            <span className="mt-0.5 w-6 shrink-0 text-center font-body text-2xl font-light text-muted">
              {num.n}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="font-body text-[13px] font-bold text-white">{num.label}</span>
                <StatusPill status={num.status} />
              </span>
              <span className="mt-0.5 block font-body text-sm font-light text-white">{num.value}</span>
              <span className="mt-0.5 block font-body text-xs font-light text-muted">{num.detail}</span>
            </span>
          </li>
        ))}
      </ol>

      <div className="mt-8 rounded-lg border border-line bg-card px-5 py-4">
        <p className="font-body text-[11px] font-bold uppercase tracking-[0.16em] text-muted">
          The four questions a founder never has to ask
        </p>
        <ul className="mt-3 space-y-2 font-body text-sm font-light text-secondary">
          <li>
            <span className="text-white">“What is the status of [project]?”</span> — the portal answers at every stakeholder’s correct level of detail.
          </li>
          <li>
            <span className="text-white">“Has the client paid?”</span> — AR is an Accounts view; the founder sees only AR beyond 45 days, above.
          </li>
          <li>
            <span className="text-white">“Why is this PIO late?”</span> — the alert arrives with its root cause already classified.
          </li>
          <li>
            <span className="text-white">“Who is managing this?”</span> — every project, WIO, PIO and WO has a named owner from creation.
          </li>
        </ul>
      </div>
    </div>
  );
}

const PILL: Record<BriefStatus, { label: string; className: string } | null> = {
  ok: { label: "On track", className: "bg-success/10 text-success" },
  watch: { label: "Watch", className: "bg-warning/10 text-warning" },
  action: { label: "Action", className: "bg-error/10 text-error" },
  none: null,
  unwired: { label: "Not wired", className: "bg-white/5 text-muted" },
};

function StatusPill({ status }: { status: BriefStatus }) {
  const pill = PILL[status];
  if (!pill) return null;
  return (
    <span className={`rounded-full px-2 py-0.5 font-body text-[10px] font-bold uppercase tracking-wide ${pill.className}`}>
      {pill.label}
    </span>
  );
}
