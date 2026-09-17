"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { InterviewSummary } from "@/lib/services/hiring";
import { formatIST } from "@/lib/format";
import { modeLabel } from "@/lib/services/hiring-logic";
import { Notice, ghostClass, pillClass, sendJson, type NoticeState } from "@/components/hiring/ui";

export type RoundEditMode = "full" | "add";

/**
 * Interviews, as a list. Used for "your interviews", the board's diary, and the
 * interviews on a candidate's page.
 *
 * Two readers, two questions. An interviewer (`viewerId`) asks "do I owe a
 * write-up?" — so their own state is shown, not a panel-wide count. HR
 * (`canManage`) asks "did it happen, and is everybody's feedback in?" — and can
 * say so: held, called off, nobody came, or excuse somebody who cannot write it
 * up. Nothing here reads the clock: whether an interview has started comes from
 * the server, so the page renders the same on both sides of hydration.
 */
export function RoundsList({
  rounds,
  viewerId,
  canManage = false,
  canView = false,
  currentCandidateId,
  renderEdit,
  emptyMessage = "Nothing in the diary.",
}: {
  rounds: InterviewSummary[];
  viewerId?: string;
  canManage?: boolean;
  /** HR may open any interview to check it, and open the candidate's file. */
  canView?: boolean;
  /** On a candidate's own page the "Candidate" link would point at itself. */
  currentCandidateId?: string;
  /** The edit form, drawn inline: the whole interview while it is ahead, only adding people once it has started. */
  renderEdit?: (round: InterviewSummary, mode: RoundEditMode, done: (message: string) => void) => React.ReactNode;
  emptyMessage?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [notices, setNotices] = useState<Record<string, NoticeState>>({});
  const [editing, setEditing] = useState<{ id: string; mode: RoundEditMode } | null>(null);

  if (rounds.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-line-strong bg-card px-6 py-8 text-center font-body text-sm font-light text-muted">
        {emptyMessage}
      </p>
    );
  }

  function say(roundId: string, notice: NoticeState) {
    setNotices((n) => ({ ...n, [roundId]: notice }));
  }

  async function setStatus(round: InterviewSummary, status: InterviewSummary["status"], said: string) {
    if (
      (status === "cancelled" || status === "no_show") &&
      !window.confirm(
        `${status === "cancelled" ? "Call off" : "Record that nobody came to"} the ${round.stageLabel} with ` +
          `${round.candidateName}?${round.started ? "" : " The panel will be told."}`,
      )
    ) {
      return;
    }
    setBusy(round.id);
    const res = await sendJson(`/api/hiring/interviews/${round.id}`, "PATCH", { status });
    setBusy(null);
    say(round.id, res.ok ? { tone: "success", message: said } : { tone: "error", message: res.data.error ?? "" });
    if (res.ok) router.refresh();
  }

  async function excuse(round: InterviewSummary, person: InterviewSummary["panel"][number]) {
    const reason = window.prompt(
      `Excuse ${person.name} from writing up the ${round.stageLabel} with ${round.candidateName}?\n\n` +
        `Say why — it goes on the candidate's trail.`,
    );
    if (reason === null) return;
    setBusy(round.id);
    const res = await sendJson(`/api/hiring/interviews/${round.id}`, "PATCH", {
      excuse: { userId: person.userId, reason },
    });
    setBusy(null);
    say(
      round.id,
      res.ok
        ? { tone: "success", message: `${person.name} is excused from this write-up.` }
        : { tone: "error", message: res.data.error ?? "" },
    );
    if (res.ok) router.refresh();
  }

  return (
    <ul className="space-y-3">
      {rounds.map((round) => {
        const onPanel = Boolean(viewerId && round.panel.some((p) => p.userId === viewerId));
        const tookPlace = round.status !== "cancelled" && round.status !== "no_show";
        // Per person, not panel size minus cards in: an excused person who
        // wrote it up anyway would otherwise make the count come out short.
        const owing = round.panel.filter((p) => !p.submitted && !p.excused);
        const owed = owing.length;
        return (
          <li key={round.id} className="rounded-lg border border-line bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-body text-[15px] font-bold text-white">{round.candidateName}</h3>
                  <span className={`${pillClass} bg-white/5 text-muted`}>{round.stageLabel}</span>
                  <RoundStatePill round={round} />
                  {round.candidateStatus !== "active" && round.candidateStatus !== "offered" ? (
                    <span className={`${pillClass} bg-alert/10 text-alert`}>candidate {round.candidateStatus}</span>
                  ) : null}
                </div>
                <p className="mt-0.5 font-body text-xs font-light text-muted">
                  {round.roleTitle} · {formatIST(round.scheduledAt)} IST · {round.durationMins} min ·{" "}
                  {modeLabel(round.mode)}
                  {round.location ? ` · ${round.location}` : ""}
                </p>
                <p className="mt-1 font-body text-xs font-light text-muted">
                  In the room:{" "}
                  {round.panel.length === 0
                    ? "nobody"
                    : round.panel
                        .map((p) => (p.excused ? `${p.name} (excused${p.excusedReason ? ` — ${p.excusedReason}` : ""})` : p.name))
                        .join(", ")}
                </p>
                <p className="mt-1 font-body text-xs font-light text-muted">
                  {round.questionSetName
                    ? `Questions: ${round.questionSetName} (${round.questionCount})`
                    : "No question set — a conversation"}
                </p>
              </div>

              <div className="flex shrink-0 flex-col items-end gap-2">
                {onPanel ? (
                  <MyState round={round} viewerId={viewerId as string} />
                ) : round.happened && tookPlace ? (
                  <span className={`font-body text-xs ${owed > 0 ? "text-amber-deep" : "text-success"}`}>
                    {owed > 0 ? `${owed} still to write up` : "Every write-up is in"}
                  </span>
                ) : null}

                <div className="flex flex-wrap justify-end gap-2">
                  {onPanel ? (
                    <Link href={`/hr/rounds/${round.id}`} className={ghostClass}>
                      Open
                    </Link>
                  ) : canView ? (
                    <Link href={`/hr/rounds/${round.id}`} className={ghostClass}>
                      View interview
                    </Link>
                  ) : null}
                  {canView && currentCandidateId !== round.candidateId ? (
                    <Link
                      href={`/hr/candidates/${round.candidateId}`}
                      className="self-center font-body text-sm text-muted underline underline-offset-4 hover:text-white"
                    >
                      Candidate
                    </Link>
                  ) : null}
                </div>
              </div>
            </div>

            {canManage && tookPlace ? (
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
                {round.status === "scheduled" && round.started ? (
                  <button type="button" disabled={busy === round.id} className={ghostClass} onClick={() => void setStatus(round, "done", "Marked held.")}>
                    Held
                  </button>
                ) : null}
                {round.status === "scheduled" ? (
                  <button type="button" disabled={busy === round.id} className={ghostClass} onClick={() => void setStatus(round, "cancelled", "Called off.")}>
                    Called off
                  </button>
                ) : null}
                {round.status === "scheduled" && round.started ? (
                  <button type="button" disabled={busy === round.id} className={ghostClass} onClick={() => void setStatus(round, "no_show", "Recorded that nobody came.")}>
                    Nobody came
                  </button>
                ) : null}
                {renderEdit ? (
                  <button
                    type="button"
                    className={ghostClass}
                    onClick={() =>
                      setEditing((v) =>
                        v?.id === round.id ? null : { id: round.id, mode: round.started ? "add" : "full" },
                      )
                    }
                  >
                    {editing?.id === round.id ? "Close" : round.started ? "Add somebody who sat in" : "Change time or panel"}
                  </button>
                ) : null}
                {round.happened
                  ? owing.map((person) => (
                      <button
                        key={person.userId}
                        type="button"
                        disabled={busy === round.id}
                        className="font-body text-xs text-muted underline underline-offset-4 hover:text-white"
                        onClick={() => void excuse(round, person)}
                      >
                        Excuse {person.name}
                      </button>
                    ))
                  : null}
              </div>
            ) : canManage && !tookPlace ? (
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
                <button type="button" disabled={busy === round.id} className={ghostClass} onClick={() => void setStatus(round, "scheduled", "Back in the diary.")}>
                  Undo — back in the diary
                </button>
              </div>
            ) : null}

            <Notice notice={notices[round.id] ?? null} />
            {editing?.id === round.id && renderEdit
              ? renderEdit(round, editing.mode, (message) => {
                  setEditing(null);
                  say(round.id, { tone: "success", message });
                })
              : null}
          </li>
        );
      })}
    </ul>
  );
}

function RoundStatePill({ round }: { round: InterviewSummary }) {
  if (round.status === "done") return <span className={`${pillClass} bg-success/10 text-success`}>Held</span>;
  if (round.status === "cancelled") return <span className={`${pillClass} bg-alert/10 text-alert`}>Called off</span>;
  if (round.status === "no_show") return <span className={`${pillClass} bg-alert/10 text-alert`}>Nobody came</span>;
  if (round.happened) return <span className={`${pillClass} bg-amber/10 text-amber-deep`}>Time has passed</span>;
  return null;
}

function MyState({ round, viewerId }: { round: InterviewSummary; viewerId: string }) {
  if (round.status === "cancelled" || round.status === "no_show") return null;
  if (round.mine === "submitted") return <span className="font-body text-xs text-success">Yours is in</span>;
  if (round.panel.find((p) => p.userId === viewerId)?.excused) {
    return <span className="font-body text-xs text-muted">You are excused from this write-up</span>;
  }
  if (round.happened) {
    return (
      <span className="font-body text-xs font-bold text-amber-deep">
        {round.mine === "draft" ? "Your draft is saved — submit it" : "Yours to write up"}
      </span>
    );
  }
  return round.mine === "draft" ? <span className="font-body text-xs text-muted">Draft saved</span> : null;
}
