import Link from "next/link";
import type { PendingReply } from "@/lib/services/candidate-portal";

/**
 * What the candidates said back — the thing the board could not tell you
 * before there was a page for them to say it on.
 *
 * Sorted by what needs doing, not by when it arrived. Somebody asking to move
 * a round is a room to rebook and three diaries to change; somebody
 * confirming is a round that can be left alone. So the asks come first, and
 * the confirmations sit under them as reassurance rather than as work.
 */

const IST = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function when(iso: string): string {
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? iso : IST.format(at).replace(",", "");
}

export function RepliesList({ replies }: { replies: PendingReply[] }) {
  if (replies.length === 0) return null;

  const asks = replies.filter((r) => r.response === "reschedule_requested");
  const confirmed = replies.filter((r) => r.response === "confirmed");

  return (
    <section className="mb-10">
      <h2 className="mb-1 font-heading text-2xl text-white">
        What the candidates said
      </h2>
      <p className="mb-3 font-body text-sm font-light text-muted">
        Replies from the pages they were sent. Moving a round is still yours to
        do — they can only ask.
      </p>

      {asks.length > 0 ? (
        <ul className="mb-3 space-y-2">
          {asks.map((r) => (
            <li
              key={r.interviewId}
              className="rounded-lg border border-warning/40 bg-warning/5 p-4"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-body text-[15px] font-bold text-white">
                  <Link
                    href={`/hr/candidates/${r.candidateId}`}
                    className="underline-offset-4 hover:underline"
                  >
                    {r.candidateName}
                  </Link>{" "}
                  <span className="font-light text-warning">
                    cannot make the {r.stage.toLowerCase()}
                  </span>
                </p>
                <p className="font-body text-xs font-light text-muted">
                  booked for {when(r.scheduledAt)} · asked {when(r.at)}
                </p>
              </div>
              {r.note ? (
                <p className="mt-2 font-body text-sm font-light text-secondary">
                  “{r.note}”
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {confirmed.length > 0 ? (
        <ul className="space-y-2">
          {confirmed.map((r) => (
            <li
              key={r.interviewId}
              className="rounded-lg border border-line bg-card px-4 py-3"
            >
              <p className="font-body text-sm font-light text-secondary">
                <Link
                  href={`/hr/candidates/${r.candidateId}`}
                  className="font-bold text-white underline-offset-4 hover:underline"
                >
                  {r.candidateName}
                </Link>{" "}
                confirmed the {r.stage.toLowerCase()} on {when(r.scheduledAt)}
                <span className="text-muted"> · {when(r.at)}</span>
              </p>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
