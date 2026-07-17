import type { ExitActionStatus, ExitRow } from "@/lib/services/exit-protocol";
import type { SuccessionPack } from "@/lib/services/succession-pack";

/**
 * Exit Protocol board — every exit, the confirmed status of all six removal
 * actions (Brief §36 · Gate #4), and the succession pack generated on
 * confirmation (Gate #7). The brief demands a "confirmed complete log"; an
 * action that did not happen is shown as such, never as done.
 */
export function ExitProtocolBoard({
  exits,
  packs,
}: {
  exits: ExitRow[];
  packs: Map<string, SuccessionPack>;
}) {
  if (exits.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-line-strong bg-card px-8 py-16 text-center">
        <p className="font-heading text-2xl text-white">No exits recorded</p>
        <p className="mt-1 font-body text-sm font-light text-muted">
          When a Keka exit date is confirmed, the protocol fires at 11:59pm on that date.
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-4">
      {exits.map((e) => (
        <li key={e.userId} className="rounded-lg border border-line bg-card p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-body text-[15px] font-bold text-white">{e.name}</h3>
                {e.fired ? (
                  <span className="rounded-full bg-success/10 px-2 py-0.5 font-body text-[10px] font-bold uppercase tracking-wide text-success">
                    Protocol fired
                  </span>
                ) : (
                  <span className="rounded-full bg-white/5 px-2 py-0.5 font-body text-[10px] font-bold uppercase tracking-wide text-muted">
                    Scheduled
                  </span>
                )}
              </div>
              <p className="mt-0.5 font-body text-xs font-light text-muted">
                {e.jobTitle ?? "—"} · exit {e.exitDate}
                {e.firedAt ? ` · fired ${e.firedAt.slice(0, 16).replace("T", " ")}` : ""}
              </p>
            </div>
          </div>

          <p className="mt-4 font-body text-[11px] font-bold uppercase tracking-[0.16em] text-muted">
            Removal actions
          </p>
          <ol className="mt-2 space-y-1.5">
            {e.actions.map((a) => (
              <li key={a.code} className="flex items-start gap-3">
                <StatusPill status={a.status} />
                <div className="min-w-0">
                  <p className="font-body text-[13px] text-white">{a.label}</p>
                  {a.detail ? (
                    <p className="font-body text-xs font-light text-muted">{a.detail}</p>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>

          <SuccessionPackBlock pack={packs.get(e.userId)} />
        </li>
      ))}
    </ul>
  );
}

/**
 * The generated succession pack. Every section here came from a
 * portal.succession_pack_sections row — HR changes this by editing rows.
 */
function SuccessionPackBlock({ pack }: { pack: SuccessionPack | undefined }) {
  if (!pack) {
    return (
      <p className="mt-5 border-t border-line pt-4 font-body text-xs font-light text-muted">
        Succession pack — not generated yet (runs the day the exit date is confirmed).
      </p>
    );
  }
  return (
    <div className="mt-5 border-t border-line pt-4">
      <p className="font-body text-[11px] font-bold uppercase tracking-[0.16em] text-muted">
        Succession pack{" "}
        <span className="font-light normal-case tracking-normal">
          · generated {pack.generatedAt.slice(0, 16).replace("T", " ")}
        </span>
      </p>
      <div className="mt-2 space-y-3">
        {pack.sections.map((s) => (
          <div key={s.code}>
            <p className="font-body text-[13px] font-bold text-white">{s.title}</p>
            {s.items.length > 0 ? (
              <ul className="mt-0.5 list-disc space-y-0.5 pl-5">
                {s.items.map((item, i) => (
                  <li key={i} className="font-body text-xs font-light text-secondary">
                    {item}
                  </li>
                ))}
              </ul>
            ) : null}
            {s.note ? <p className="mt-0.5 font-body text-xs font-light text-muted">{s.note}</p> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

const PILL: Record<ExitActionStatus, { label: string; className: string }> = {
  completed: { label: "Done", className: "bg-success/10 text-success" },
  partial: { label: "Partial", className: "bg-warning/10 text-warning" },
  not_wired: { label: "Not wired", className: "bg-error/10 text-error" },
  failed: { label: "Failed", className: "bg-error/10 text-error" },
  pending: { label: "Pending", className: "bg-white/5 text-muted" },
};

function StatusPill({ status }: { status: ExitActionStatus }) {
  const pill = PILL[status];
  return (
    <span
      className={`mt-0.5 w-[74px] shrink-0 rounded-full px-2 py-0.5 text-center font-body text-[10px] font-bold uppercase tracking-wide ${pill.className}`}
    >
      {pill.label}
    </span>
  );
}
