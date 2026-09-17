"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type {
  CandidateDetail,
  Colleague,
  HiringRights,
  InterviewSummary,
  QuestionSet,
  Scorecard,
  Stage,
} from "@/lib/services/hiring";
import {
  LIMITS,
  defaultRoundStage,
  isStillMoving,
  isoToIstLocal,
  istLocalToIso,
  lakhsToRupees,
  pickQuestionSet,
  rupeesToLakhs,
  setFits,
} from "@/lib/services/hiring-logic";
import { formatIST, formatLakhs } from "@/lib/format";
import { RoundsList } from "@/components/hiring/RoundsList";
import {
  CandidateStatusPill,
  ColleaguePicker,
  Field,
  Notice,
  RecommendationPill,
  dangerClass,
  ghostClass,
  inputClass,
  pillClass,
  primaryClass,
  sendJson,
  type NoticeState,
} from "@/components/hiring/ui";

/**
 * A candidate's file. Everything the company knows about one person's
 * application, in the order it happened — and every action on it, each with
 * its message beside it.
 */
export function CandidateFile({
  candidate,
  stages,
  questionSets,
  rights,
  viewer,
}: {
  candidate: CandidateDetail;
  stages: Stage[];
  questionSets: QuestionSet[];
  rights: HiringRights;
  viewer: { id: string; name: string };
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [decideNotice, setDecideNotice] = useState<NoticeState>(null);
  const [busy, setBusy] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [scheduleNotice, setScheduleNotice] = useState<NoticeState>(null);
  const [editingDetails, setEditingDetails] = useState(false);

  const stillMoving = isStillMoving(candidate.status);
  const finalStage = stages.find((s) => s.isFinal);

  async function decide(body: { stage?: string; status?: string }, said: string, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    setDecideNotice(null);
    const url = `/api/hiring/candidates/${candidate.id}`;
    let res = await sendJson<{ needsConfirm?: boolean }>(url, "PATCH", { ...body, note: note || null });
    // A hire that takes the seat's last place while others are still moving
    // is asked about in the server's own words, then sent again if yes.
    if (res.status === 409 && res.data.needsConfirm) {
      if (!window.confirm(res.data.error ?? "")) {
        setBusy(false);
        setDecideNotice({ tone: "error", message: "Nothing was changed." });
        return;
      }
      res = await sendJson(url, "PATCH", { ...body, note: note || null, confirm: true });
    }
    setBusy(false);
    if (!res.ok) {
      setDecideNotice({ tone: "error", message: res.data.error ?? "" });
      return;
    }
    setNote("");
    setDecideNotice({ tone: "success", message: said });
    router.refresh();
  }

  return (
    <div className="mt-4 space-y-8">
      <header>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-heading text-4xl text-white">{candidate.name}</h1>
          <span className={`${pillClass} bg-white/5 text-muted`}>{candidate.stageLabel}</span>
          <CandidateStatusPill status={candidate.status} />
        </div>
        <p className="mt-1 font-body text-sm font-light text-muted">
          {candidate.roleTitle}
          {candidate.source ? ` · ${candidate.source}` : ""}
          {candidate.email ? ` · ${candidate.email}` : ""}
          {candidate.phone ? ` · ${candidate.phone}` : ""}
        </p>
        <p className="mt-1 font-body text-sm font-light text-muted">
          {candidate.expectedCtc != null ? `Asking ${formatLakhs(candidate.expectedCtc)}` : "Asking: not recorded"}
          {candidate.currentCtc != null ? ` · earns ${formatLakhs(candidate.currentCtc)} now` : ""}
          {candidate.noticeDays != null ? ` · ${candidate.noticeDays} days' notice` : ""}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-4">
          {candidate.resumeUrl ? (
            <a
              href={candidate.resumeUrl}
              target="_blank"
              rel="noreferrer"
              className="font-body text-sm text-white underline underline-offset-4"
            >
              Open the CV
            </a>
          ) : (
            <span className="font-body text-sm text-muted">No CV link</span>
          )}
          {rights.decide ? (
            <button
              type="button"
              onClick={() => setEditingDetails((v) => !v)}
              className="font-body text-sm text-muted underline underline-offset-4 hover:text-white"
            >
              {editingDetails ? "Close" : "Correct details"}
            </button>
          ) : null}
        </div>
        {candidate.outcomeNote && !stillMoving ? (
          <p className="mt-3 rounded-lg border border-line bg-card px-4 py-3 font-body text-sm font-light text-muted">
            {candidate.outcomeNote}
          </p>
        ) : null}
        {editingDetails ? (
          <DetailsForm
            candidate={candidate}
            onSaved={() => {
              setEditingDetails(false);
              router.refresh();
            }}
          />
        ) : null}
      </header>

      {candidate.previous.length > 0 ? (
        <section className="rounded-lg border border-amber/30 bg-amber/5 p-4">
          <h2 className="font-body text-sm font-bold text-white">Has applied before</h2>
          <ul className="mt-2 space-y-1">
            {candidate.previous.map((p) => (
              <li key={p.id} className="font-body text-sm text-white">
                <Link href={`/hr/candidates/${p.id}`} className="underline underline-offset-4">
                  {p.roleTitle}
                </Link>{" "}
                <span className="text-xs font-light text-muted">
                  — {p.status} at {p.stageLabel}, added {formatIST(p.createdAt)}
                  {p.outcomeNote ? ` · “${p.outcomeNote}”` : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {rights.decide ? (
        <section className="rounded-lg border border-line bg-card p-5">
          <h2 className="font-heading text-2xl text-white">{stillMoving ? "Where next" : "Reopen"}</h2>
          <p className="mt-1 font-body text-sm font-light text-muted">
            {stillMoving
              ? "A note is required to stop somebody. It is the only thing that helps when they apply again."
              : `${candidate.name} is ${candidate.status}. Reopening puts them back on the board — say why.`}
          </p>

          <Field label="Note">
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className={inputClass}
              placeholder="Why — in a sentence."
            />
          </Field>

          {stillMoving ? (
            <>
              <p className="mt-4 font-body text-[11px] font-bold uppercase tracking-[0.16em] text-muted">Move to</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {stages
                  .filter((s) => s.code !== candidate.stage)
                  .map((stage) => (
                    <button
                      key={stage.code}
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void decide(
                          { stage: stage.code },
                          stage.isFinal
                            ? `Offer made to ${candidate.name}.`
                            : `${candidate.name} moved to ${stage.label}.`,
                          stage.isFinal ? `Make ${candidate.name} an offer?` : undefined,
                        )
                      }
                      className={ghostClass}
                    >
                      {stage.isFinal ? `${stage.label} — make the offer` : `→ ${stage.label}`}
                    </button>
                  ))}
              </div>

              <p className="mt-4 font-body text-[11px] font-bold uppercase tracking-[0.16em] text-muted">Decide</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  className="rounded-lg border border-forest/40 px-3 py-2 font-body text-sm font-bold text-success hover:bg-forest/5 disabled:opacity-40"
                  onClick={() =>
                    void decide(
                      { status: "hired" },
                      `${candidate.name} is hired.`,
                      `Mark ${candidate.name} HIRED for "${candidate.roleTitle}"?` +
                        (candidate.status !== "offered" && finalStage
                          ? ` No offer is on record yet.`
                          : ""),
                    )
                  }
                >
                  Hired
                </button>
                <button
                  type="button"
                  disabled={busy}
                  className={dangerClass}
                  onClick={() =>
                    void decide(
                      { status: "rejected" },
                      `${candidate.name} is marked rejected.`,
                      `Reject ${candidate.name}? Their upcoming interviews will be called off.`,
                    )
                  }
                >
                  Rejected
                </button>
                <button
                  type="button"
                  disabled={busy}
                  className={dangerClass}
                  onClick={() =>
                    void decide(
                      { status: "withdrawn" },
                      `${candidate.name} is marked withdrawn.`,
                      `Record that ${candidate.name} withdrew? Their upcoming interviews will be called off.`,
                    )
                  }
                >
                  Withdrew
                </button>
              </div>
            </>
          ) : (
            <button
              type="button"
              disabled={busy}
              className={`mt-4 ${ghostClass}`}
              onClick={() => void decide({ status: "active" }, `${candidate.name} is back on the board.`)}
            >
              Reopen
            </button>
          )}
          <Notice notice={decideNotice} />
        </section>
      ) : null}

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-heading text-2xl text-white">Interviews</h2>
          {rights.add && stillMoving ? (
            <button type="button" onClick={() => setScheduling((v) => !v)} className={ghostClass}>
              {scheduling ? "Cancel" : "Schedule an interview"}
            </button>
          ) : null}
        </div>

        <Notice notice={scheduleNotice} />

        {scheduling ? (
          <RoundForm
            mode="create"
            stages={stages}
            questionSets={questionSets}
            roleId={candidate.roleId}
            candidateStage={candidate.stage}
            viewer={viewer}
            onSubmit={async (input) => {
              const res = await sendJson("/api/hiring/interviews", "POST", {
                ...input,
                candidateId: candidate.id,
              });
              if (!res.ok) return res.data.error ?? "";
              setScheduling(false);
              setScheduleNotice({ tone: "success", message: "The interview is in the diary, and the panel has been told." });
              router.refresh();
              return null;
            }}
          />
        ) : null}

        <RoundsList
          rounds={candidate.interviews}
          viewerId={viewer.id}
          canManage={rights.add}
          canView={rights.see}
          currentCandidateId={candidate.id}
          emptyMessage={
            stillMoving && rights.add
              ? "No interviews yet. Click “Schedule an interview” above."
              : "No interviews."
          }
          renderEdit={(round, editMode, done) => (
            <RoundForm
              mode={editMode === "add" ? "add" : "edit"}
              round={round}
              stages={stages}
              questionSets={questionSets}
              roleId={candidate.roleId}
              candidateStage={candidate.stage}
              viewer={viewer}
              onSubmit={async (input) => {
                const res = await sendJson(`/api/hiring/interviews/${round.id}`, "PATCH", input);
                if (!res.ok) return res.data.error ?? "";
                done(
                  editMode === "add"
                    ? "Added to the panel, and told."
                    : "The interview is changed, and the people affected have been told.",
                );
                router.refresh();
                return null;
              }}
            />
          )}
        />
      </section>

      <section>
        <h2 className="mb-3 font-heading text-2xl text-white">What the interviewers thought</h2>
        {candidate.scorecards.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line-strong bg-card px-6 py-8 text-center font-body text-sm font-light text-muted">
            Nothing written up yet.
          </p>
        ) : (
          <ul className="space-y-4">
            {candidate.scorecards.map((card) => (
              <ScorecardCard
                key={`${card.interviewId}-${card.byUserId}`}
                card={card}
                round={candidate.interviews.find((i) => i.id === card.interviewId)}
              />
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 font-heading text-2xl text-white">Trail</h2>
        <ol className="space-y-2">
          {candidate.activity.map((entry, index) => (
            <li key={`${entry.at}-${index}`} className="flex flex-wrap items-baseline gap-2">
              <span className="font-body text-xs text-muted">{formatIST(entry.at)}</span>
              <span className="font-body text-sm text-white">{entry.what}</span>
              <span className="font-body text-xs font-light text-muted">
                {entry.by ? `· ${entry.by}` : ""}
                {entry.detail ? ` · ${readableDetail(entry.detail)}` : ""}
              </span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

/** Older trail lines stored a raw timestamp; show it in IST like everything else. */
function readableDetail(detail: string): string {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(detail) ? `${formatIST(detail)} IST` : detail;
}

function ScorecardCard({ card, round }: { card: Scorecard; round?: InterviewSummary }) {
  return (
    <li className="rounded-lg border border-line bg-card p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-body text-[15px] font-bold text-white">{card.by}</h3>
        <RecommendationPill call={card.recommendation} />
        <span className="font-body text-xs font-light text-muted">
          {round ? `${round.stageLabel} · ` : ""}
          {card.submittedAt ? `${formatIST(card.submittedAt)} IST` : "draft"}
        </span>
      </div>
      {card.strengths ? (
        <p className="mt-3 font-body text-sm font-light text-white">
          <span className="font-bold text-muted">Strengths. </span>
          {card.strengths}
        </p>
      ) : null}
      {card.concerns ? (
        <p className="mt-2 font-body text-sm font-light text-white">
          <span className="font-bold text-muted">Concerns. </span>
          {card.concerns}
        </p>
      ) : null}
      {card.answers.length > 0 ? (
        <ol className="mt-4 space-y-3 border-t border-line pt-4">
          {card.answers.map((answer) => (
            <li key={answer.questionId}>
              <p className="font-body text-[13px] text-white">{answer.prompt}</p>
              <p className="mt-0.5 font-body text-xs font-light text-muted">
                {answer.rating != null ? `${answer.rating} of 4` : "not rated"}
                {answer.notes ? ` · ${answer.notes}` : ""}
              </p>
            </li>
          ))}
        </ol>
      ) : null}
    </li>
  );
}

function DetailsForm({ candidate, onSaved }: { candidate: CandidateDetail; onSaved: () => void }) {
  const [fullName, setFullName] = useState(candidate.name);
  const [email, setEmail] = useState(candidate.email ?? "");
  const [phone, setPhone] = useState(candidate.phone ?? "");
  const [source, setSource] = useState(candidate.source ?? "");
  const [asking, setAsking] = useState(rupeesToLakhs(candidate.expectedCtc));
  const [current, setCurrent] = useState(rupeesToLakhs(candidate.currentCtc));
  const [noticeDays, setNoticeDays] = useState(candidate.noticeDays == null ? "" : String(candidate.noticeDays));
  const [resumeUrl, setResumeUrl] = useState(candidate.resumeUrl ?? "");
  const [notice, setNotice] = useState<NoticeState>(null);
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="mt-4 rounded-lg border border-line bg-card p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const expectedCtc = lakhsToRupees(asking);
        const currentCtc = lakhsToRupees(current);
        if (Number.isNaN(expectedCtc) || Number.isNaN(currentCtc)) {
          setNotice({ tone: "error", message: "Salary is a number of lakhs, like 5.4." });
          return;
        }
        setBusy(true);
        const res = await sendJson(`/api/hiring/candidates/${candidate.id}`, "PATCH", {
          details: {
            fullName,
            email: email || null,
            phone: phone || null,
            source: source || null,
            expectedCtc,
            currentCtc,
            noticeDays: noticeDays ? Number(noticeDays) : null,
            resumeUrl: resumeUrl || null,
          },
        });
        setBusy(false);
        if (!res.ok) {
          setNotice({ tone: "error", message: res.data.error ?? "" });
          return;
        }
        onSaved();
      }}
    >
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Name">
          <input required maxLength={LIMITS.candidateName} value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Where they came from">
          <input maxLength={LIMITS.source} value={source} onChange={(e) => setSource(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Email">
          <input type="email" maxLength={LIMITS.email} value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Phone">
          <input type="tel" maxLength={LIMITS.phone} value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Asking (₹ lakh a year)">
          <input type="number" min={0} step="0.01" value={asking} onChange={(e) => setAsking(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Earns now (₹ lakh a year)">
          <input type="number" min={0} step="0.01" value={current} onChange={(e) => setCurrent(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Notice (days)">
          <input type="number" min={0} max={365} step={1} value={noticeDays} onChange={(e) => setNoticeDays(e.target.value)} className={inputClass} />
        </Field>
        <Field label="CV (link)">
          <input inputMode="url" value={resumeUrl} onChange={(e) => setResumeUrl(e.target.value)} className={inputClass} placeholder="https://…" />
        </Field>
      </div>
      <Notice notice={notice} />
      <button type="submit" disabled={busy} className={`mt-4 ${primaryClass}`}>
        {busy ? "Saving…" : "Save the details"}
      </button>
    </form>
  );
}

type RoundPayload = {
  stageCode?: string;
  scheduledAt?: string;
  durationMins?: number;
  mode?: "in_person" | "video" | "phone";
  location?: string | null;
  panel?: string[];
  questionSetId?: string | null;
};

function setLabel(set: QuestionSet): string {
  return `${set.name} — ${set.roleTitle ?? "any seat"} · ${set.stageLabel ?? "any stage"} (${set.questions.length})`;
}

/**
 * Scheduling an interview, changing one still ahead, or — once it has started —
 * adding somebody who sat in. An edit sends only what changed: resending an
 * unchanged panel re-checked every member, so one colleague who had since left
 * stopped the interview being moved at all.
 */
function RoundForm({
  mode,
  round,
  stages,
  questionSets,
  roleId,
  candidateStage,
  viewer,
  onSubmit,
}: {
  mode: "create" | "edit" | "add";
  round?: InterviewSummary;
  stages: Stage[];
  questionSets: QuestionSet[];
  roleId: string;
  candidateStage: string;
  viewer: { id: string; name: string };
  onSubmit: (input: RoundPayload) => Promise<string | null>;
}) {
  const roundStages = stages.filter((s) => !s.isFinal);
  const [stageCode, setStageCode] = useState(round?.stageCode ?? defaultRoundStage(stages, candidateStage));
  const [when, setWhen] = useState(round ? isoToIstLocal(round.scheduledAt) : "");
  const [durationMins, setDurationMins] = useState(String(round?.durationMins ?? 45));
  const [how, setHow] = useState<RoundPayload["mode"]>(round?.mode ?? "in_person");
  const [location, setLocation] = useState(round?.location ?? "");
  const [questionSetId, setQuestionSetId] = useState(round?.questionSetId ?? "");
  const [panel, setPanel] = useState<Colleague[]>(
    round && mode === "edit" ? round.panel.map((p) => ({ id: p.userId, name: p.name, email: "", jobTitle: null })) : [],
  );
  const [notice, setNotice] = useState<NoticeState>(null);
  const [busy, setBusy] = useState(false);

  const fitting = questionSets.filter((s) => setFits(s, roleId, stageCode));
  const auto = pickQuestionSet(questionSets, roleId, stageCode);
  const keepsRetired =
    mode === "edit" && round?.questionSetId && !fitting.some((s) => s.id === round.questionSetId);

  if (mode === "add" && round) {
    const already = round.panel.map((p) => p.userId);
    return (
      <form
        className="mt-3 rounded-lg border border-line bg-card p-5"
        onSubmit={async (e) => {
          e.preventDefault();
          setNotice(null);
          const extra = panel.filter((p) => !already.includes(p.id));
          if (extra.length === 0) {
            setNotice({ tone: "error", message: "Pick somebody to add — click a name in the list, or “Add me”." });
            return;
          }
          setBusy(true);
          const error = await onSubmit({ panel: [...already, ...extra.map((p) => p.id)] });
          setBusy(false);
          if (error) setNotice({ tone: "error", message: error });
        }}
      >
        <p className="font-body text-sm font-light text-muted">
          This interview has started, so its time and questions are fixed. You can add somebody who
          sat in and has a write-up to do. Already on the panel: {round.panel.map((p) => p.name).join(", ")}.
        </p>
        <Field label="Add to the panel">
          <ColleaguePicker
            value={panel}
            onChange={(next) => setPanel(next.filter((p) => !already.includes(p.id)))}
            viewer={already.includes(viewer.id) ? undefined : viewer}
          />
        </Field>
        <Notice notice={notice} />
        <button type="submit" disabled={busy} className={`mt-4 ${primaryClass}`}>
          {busy ? "Saving…" : "Add to the panel"}
        </button>
      </form>
    );
  }

  return (
    <form
      className="mt-3 rounded-lg border border-line bg-card p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setNotice(null);
        const scheduledAt = istLocalToIso(when);
        if (!scheduledAt) {
          setNotice({ tone: "error", message: "Pick a date and time for the interview." });
          return;
        }
        if (panel.length === 0) {
          setNotice({
            tone: "error",
            message: "Add at least one person who will sit in — click a name in the list, or “Add me”.",
          });
          return;
        }
        const ids = panel.map((p) => p.id);
        let payload: RoundPayload;
        if (mode === "create" || !round) {
          payload = {
            stageCode,
            scheduledAt,
            durationMins: Number(durationMins),
            mode: how,
            location: location || null,
            panel: ids,
            questionSetId: questionSetId || null,
          };
        } else {
          payload = {};
          if (scheduledAt !== new Date(round.scheduledAt).toISOString()) payload.scheduledAt = scheduledAt;
          if (Number(durationMins) !== round.durationMins) payload.durationMins = Number(durationMins);
          if (how !== round.mode) payload.mode = how;
          if ((location || null) !== (round.location ?? null)) payload.location = location || null;
          const before = round.panel.map((p) => p.userId);
          if (ids.length !== before.length || ids.some((id, i) => id !== before[i])) payload.panel = ids;
          if ((questionSetId || null) !== (round.questionSetId ?? null)) payload.questionSetId = questionSetId || null;
          if (Object.keys(payload).length === 0) {
            setNotice({ tone: "error", message: "Nothing has changed." });
            return;
          }
        }
        setBusy(true);
        const error = await onSubmit(payload);
        setBusy(false);
        if (error) setNotice({ tone: "error", message: error });
      }}
    >
      <div className="grid gap-3 md:grid-cols-2">
        {mode === "create" ? (
          <Field label="Which interview" hint={stages.find((s) => s.code === stageCode)?.description ?? undefined}>
            <select
              value={stageCode}
              onChange={(e) => {
                setStageCode(e.target.value);
                if (!questionSets.some((s) => s.id === questionSetId && setFits(s, roleId, e.target.value))) {
                  setQuestionSetId("");
                }
              }}
              className={inputClass}
            >
              {roundStages.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.label}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
        <Field label="When (India time)">
          <input type="datetime-local" required value={when} onChange={(e) => setWhen(e.target.value)} className={inputClass} />
        </Field>
        <Field label="How long (minutes)">
          <input type="number" min={5} max={600} step={5} required value={durationMins} onChange={(e) => setDurationMins(e.target.value)} className={inputClass} />
        </Field>
        <Field label="How">
          <select value={how} onChange={(e) => setHow(e.target.value as RoundPayload["mode"])} className={inputClass}>
            <option value="in_person">in person</option>
            <option value="video">video</option>
            <option value="phone">phone</option>
          </select>
        </Field>
      </div>

      <Field label="Where, or the meeting link">
        <input maxLength={LIMITS.roundLocation} value={location} onChange={(e) => setLocation(e.target.value)} className={inputClass} placeholder="NH8 — meeting room 2" />
      </Field>

      <Field
        label="Questions to ask"
        hint={
          questionSetId || mode === "edit"
            ? undefined
            : auto
              ? `The portal will use “${auto.name}”.`
              : "No question set fits this seat and interview — it will be a conversation. Sets are written in the Question bank."
        }
      >
        <select value={questionSetId} onChange={(e) => setQuestionSetId(e.target.value)} className={inputClass}>
          <option value="">{mode === "edit" ? "None — a conversation" : "Choose for me"}</option>
          {keepsRetired ? (
            <option value={round!.questionSetId!}>Keep: {round!.questionSetName}</option>
          ) : null}
          {fitting.map((set) => (
            <option key={set.id} value={set.id}>
              {setLabel(set)}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Who is sitting in" hint="The first person added leads. Everybody added is told.">
        <ColleaguePicker value={panel} onChange={setPanel} viewer={viewer} />
      </Field>

      <Notice notice={notice} />
      <button type="submit" disabled={busy} className={`mt-4 ${primaryClass}`}>
        {busy ? "Saving…" : mode === "create" ? "Put it in the diary" : "Save the changes"}
      </button>
    </form>
  );
}
