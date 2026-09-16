import Link from "next/link";
import type { InterviewSummary } from "@/lib/services/hiring";

/**
 * Rounds, as a list. Used twice: the diary on the hiring board, and "your
 * rounds" for whoever is sitting in them.
 *
 * `viewerId` is what turns a list into a to-do: when it is given, a round that
 * has happened and is still missing this person's write-up says so, in place
 * of a count that means nothing to them.
 */
export function RoundsList({
  rounds,
  viewerId,
  emptyMessage = "Nothing in the diary.",
}: {
  rounds: InterviewSummary[];
  viewerId?: string;
  emptyMessage?: string;
}) {
  if (rounds.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-line-strong bg-card px-6 py-8 text-center font-body text-sm font-light text-muted">
        {emptyMessage}
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {rounds.map((round) => {
        const owed = Math.max(0, round.panel.length - round.scorecardsIn);
        return (
          <li key={round.id} className="rounded-lg border border-line bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-body text-[15px] font-bold text-white">
                    {round.candidateName}
                  </h3>
                  <span className="rounded-full bg-white/5 px-2 py-0.5 font-body text-[10px] font-bold uppercase tracking-wide text-muted">
                    {round.stageLabel}
                  </span>
                  {round.status === "done" ? (
                    <span className="rounded-full bg-success/10 px-2 py-0.5 font-body text-[10px] font-bold uppercase tracking-wide text-success">
                      Held
                    </span>
                  ) : null}
                  {round.status === "cancelled" || round.status === "no_show" ? (
                    <span className="rounded-full bg-alert/10 px-2 py-0.5 font-body text-[10px] font-bold uppercase tracking-wide text-alert">
                      {round.status === "no_show" ? "Nobody came" : "Called off"}
                    </span>
                  ) : null}
                </div>
                <p className="mt-0.5 font-body text-xs font-light text-muted">
                  {round.roleTitle} · {when(round.scheduledAt)} · {round.durationMins} min ·{" "}
                  {modeLabel(round.mode)}
                  {round.location ? ` · ${round.location}` : ""}
                </p>
                <p className="mt-1 font-body text-xs font-light text-muted">
                  {round.panel.map((p) => p.name).join(", ") || "No panel"}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-3">
                {round.status === "done" ? (
                  <span
                    className={`font-body text-xs ${owed > 0 ? "text-amber-deep" : "text-success"}`}
                  >
                    {owed > 0
                      ? `${owed} still to write up`
                      : `${round.scorecardsIn} written up`}
                  </span>
                ) : null}
                {viewerId && round.panel.some((p) => p.userId === viewerId) ? (
                  <Link
                    href={`/hr/rounds/${round.id}`}
                    className="rounded-lg border border-line px-3 py-1.5 font-body text-sm font-bold text-white hover:bg-hover"
                  >
                    Open
                  </Link>
                ) : (
                  <Link
                    href={`/hr/candidates/${round.candidateId}`}
                    className="font-body text-sm text-muted underline underline-offset-4 hover:text-white"
                  >
                    Candidate
                  </Link>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * A moment, in the time zone the company actually works in.
 *
 * Elsewhere in the portal a timestamp is rendered by slicing the ISO string,
 * which shows UTC. On an audit stamp that is untidy; on an interview it is a
 * missed interview — 11:30 in Gurugram renders as 06:00 and somebody believes
 * it. The zone is named rather than taken from the machine so the server and
 * the browser render the same string and hydration does not tear.
 */
const IST = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function when(iso: string): string {
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? iso : IST.format(at).replace(",", "");
}

export function modeLabel(mode: InterviewSummary["mode"]): string {
  if (mode === "video") return "video";
  if (mode === "phone") return "phone";
  return "in person";
}
