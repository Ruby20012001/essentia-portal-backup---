"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type {
  CandidateDetail,
  HiringRights,
  Scorecard,
  Stage,
} from "@/lib/services/hiring";
import { Field, inputClass, primaryClass } from "@/components/hiring/HiringBoard";
import { RoundsList, when } from "@/components/hiring/RoundsList";
import { formatINR } from "@/lib/format";

type Banner = { tone: "error" | "success"; message: string };
type Colleague = { id: string; name: string; email: string; jobTitle: string | null };

/**
 * A candidate's file. Everything the company knows about one conversation
 * with one person, in the order it happened.
 *
 * The refusals are the point of the screen as much as the actions are. Moving
 * somebody on while an interviewer still owes a write-up is refused in words,
 * because the alternative is deciding without the person who was in the room.
 */
export function CandidateFile({
  candidate,
  stages,
  questionSets,
  rights,
}: {
  candidate: CandidateDetail;
  stages: Stage[];
  questionSets: { id: string; name: string; stageCode: string | null; count: number }[];
  rights: HiringRights;
}) {
  const router = useRouter();
  const [banner, setBanner] = useState<Banner | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [scheduling, setScheduling] = useState(false);

  const stillMoving = candidate.status === "active" || candidate.status === "offered";

  async function send(
    url: string,
    method: "POST" | "PATCH",
    body: unknown,
    success: string,
  ): Promise<boolean> {
    setBusy(true);
    setBanner(null);
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setBanner({ tone: "error", message: data.error ?? `Request failed (${res.status})` });
        return false;
      }
      setBanner({ tone: "success", message: success });
      setNote("");
      router.refresh();
      return true;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 space-y-8">
      <header>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-heading text-4xl text-white">{candidate.name}</h1>
          <span className="rounded-full bg-white/5 px-2 py-0.5 font-body text-[10px] font-bold uppercase tracking-wide text-muted">
            {candidate.stageLabel}
          </span>
          {!stillMoving ? (
            <span className="rounded-full bg-alert/10 px-2 py-0.5 font-body text-[10px] font-bold uppercase tracking-wide text-alert">
              {candidate.status}
            </span>
          ) : null}
        </div>
        <p className="mt-1 font-body text-sm font-light text-muted">
          {candidate.roleTitle}
          {candidate.source ? ` · ${candidate.source}` : ""}
          {candidate.email ? ` · ${candidate.email}` : ""}
          {candidate.phone ? ` · ${candidate.phone}` : ""}
        </p>
        <p className="mt-1 font-body text-sm font-light text-muted">
          {candidate.expectedCtc != null
            ? `Asking ${formatINR(candidate.expectedCtc)}`
            : "No number on record"}
          {candidate.currentCtc != null ? ` · on ${formatINR(candidate.currentCtc)}` : ""}
          {candidate.noticeDays != null ? ` · ${candidate.noticeDays} days' notice` : ""}
        </p>
        {candidate.resumeUrl ? (
          <a
            href={candidate.resumeUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-block font-body text-sm text-white underline underline-offset-4"
          >
            Open the CV
          </a>
        ) : null}
        {candidate.outcomeNote ? (
          <p className="mt-3 rounded-lg border border-line bg-card px-4 py-3 font-body text-sm font-light text-muted">
            {candidate.outcomeNote}
          </p>
        ) : null}
      </header>

      {banner ? (
        <div
          className={`rounded-lg border-l-4 px-5 py-3 font-body text-sm ${
            banner.tone === "error"
              ? "border-alert bg-alert/5 text-alert"
              : "border-forest bg-forest/5 text-success"
          }`}
          role="status"
        >
          {banner.message}
        </div>
      ) : null}

      {rights.decide && stillMoving ? (
        <section className="rounded-lg border border-line bg-card p-5">
          <h2 className="font-heading text-2xl text-white">Where next</h2>
          <p className="mt-1 font-body text-sm font-light text-muted">
            A note is required to stop somebody. It is the only thing that helps
            when they apply again.
          </p>

          <Field label="Note">
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className={inputClass}
              placeholder="Why — in a sentence."
            />
          </Field>

          <div className="mt-4 flex flex-wrap gap-2">
            {stages
              .filter((s) => s.code !== candidate.stage)
              .map((stage) => (
                <button
                  key={stage.code}
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void send(
                      `/api/hiring/candidates/${candidate.id}`,
                      "PATCH",
                      { stage: stage.code, note: note || null },
                      `${candidate.name} moved to ${stage.label}.`,
                    )
                  }
                  className="rounded-lg border border-line px-3 py-2 font-body text-sm font-bold text-white hover:bg-hover disabled:opacity-40"
                >
                  → {stage.label}
                </button>
              ))}
          </div>

          <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
            {(["offered", "hired", "rejected", "withdrawn"] as const).map((status) => (
              <button
                key={status}
                type="button"
                disabled={busy}
                onClick={() =>
                  void send(
                    `/api/hiring/candidates/${candidate.id}`,
                    "PATCH",
                    { status, note: note || null },
                    `${candidate.name} marked ${status}.`,
                  )
                }
                className={`rounded-lg border px-3 py-2 font-body text-sm font-bold disabled:opacity-40 ${
                  status === "hired" || status === "offered"
                    ? "border-forest/40 text-success hover:bg-forest/5"
                    : "border-alert/40 text-alert hover:bg-alert/5"
                }`}
              >
                {status}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-heading text-2xl text-white">Rounds</h2>
          {rights.add && stillMoving ? (
            <button
              type="button"
              onClick={() => setScheduling((v) => !v)}
              className="rounded-lg border border-line px-4 py-2 font-body text-sm font-bold text-white hover:bg-hover"
            >
              {scheduling ? "Cancel" : "Schedule a round"}
            </button>
          ) : null}
        </div>

        {scheduling ? (
          <ScheduleForm
            stages={stages}
            questionSets={questionSets}
            defaultStage={candidate.stage}
            busy={busy}
            onSubmit={async (input) => {
              const ok = await send(
                "/api/hiring/interviews",
                "POST",
                { ...input, candidateId: candidate.id },
                "The round is in the diary.",
              );
              if (ok) setScheduling(false);
            }}
          />
        ) : null}

        <RoundsList rounds={candidate.interviews} emptyMessage="No rounds yet." />
      </section>

      <section>
        <h2 className="mb-3 font-heading text-2xl text-white">What the room thought</h2>
        {candidate.scorecards.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line-strong bg-card px-6 py-8 text-center font-body text-sm font-light text-muted">
            Nothing written up yet.
          </p>
        ) : (
          <ul className="space-y-4">
            {candidate.scorecards.map((card) => (
              <ScorecardCard key={`${card.interviewId}-${card.byUserId}`} card={card} />
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 font-heading text-2xl text-white">Trail</h2>
        <ol className="space-y-2">
          {candidate.activity.map((entry, index) => (
            <li key={`${entry.at}-${index}`} className="flex flex-wrap items-baseline gap-2">
              <span className="font-body text-xs text-muted">
                {when(entry.at)}
              </span>
              <span className="font-body text-sm text-white">{entry.what}</span>
              <span className="font-body text-xs font-light text-muted">
                {entry.by ? `· ${entry.by}` : ""}
                {entry.detail ? ` · ${entry.detail}` : ""}
              </span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function ScorecardCard({ card }: { card: Scorecard }) {
  return (
    <li className="rounded-lg border border-line bg-card p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-body text-[15px] font-bold text-white">{card.by}</h3>
        <RecommendationPill call={card.recommendation} />
        <span className="font-body text-xs font-light text-muted">
          {card.submittedAt ? when(card.submittedAt) : "draft"}
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

export function RecommendationPill({ call }: { call: Scorecard["recommendation"] }) {
  if (!call) {
    return (
      <span className="rounded-full bg-white/5 px-2 py-0.5 font-body text-[10px] font-bold uppercase tracking-wide text-muted">
        no call
      </span>
    );
  }
  const yes = call === "yes" || call === "strong_yes";
  return (
    <span
      className={`rounded-full px-2 py-0.5 font-body text-[10px] font-bold uppercase tracking-wide ${
        yes ? "bg-success/10 text-success" : "bg-alert/10 text-alert"
      }`}
    >
      {call.replace("_", " ")}
    </span>
  );
}

function ScheduleForm({
  stages,
  questionSets,
  defaultStage,
  busy,
  onSubmit,
}: {
  stages: Stage[];
  questionSets: { id: string; name: string; stageCode: string | null; count: number }[];
  defaultStage: string;
  busy: boolean;
  onSubmit: (input: {
    stageCode: string;
    scheduledAt: string;
    durationMins: number;
    mode: "in_person" | "video" | "phone";
    location: string | null;
    panel: string[];
    questionSetId: string | null;
  }) => void;
}) {
  const [stageCode, setStageCode] = useState(defaultStage);
  const [scheduledAt, setScheduledAt] = useState("");
  const [durationMins, setDurationMins] = useState(45);
  const [mode, setMode] = useState<"in_person" | "video" | "phone">("in_person");
  const [location, setLocation] = useState("");
  const [questionSetId, setQuestionSetId] = useState("");
  const [panel, setPanel] = useState<Colleague[]>([]);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Colleague[]>([]);

  async function lookUp(q: string) {
    setSearch(q);
    if (q.trim().length < 2) return setResults([]);
    const res = await fetch(`/api/users?q=${encodeURIComponent(q)}`);
    if (res.ok) setResults((await res.json()).users);
  }

  return (
    <form
      className="mb-4 rounded-lg border border-line bg-card p-5"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          stageCode,
          scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : "",
          durationMins,
          mode,
          location: location || null,
          panel: panel.map((p) => p.id),
          questionSetId: questionSetId || null,
        });
      }}
    >
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Stage">
          <select
            value={stageCode}
            onChange={(e) => setStageCode(e.target.value)}
            className={inputClass}
          >
            {stages.map((s) => (
              <option key={s.code} value={s.code}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="When">
          <input
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="How long (minutes)">
          <input
            type="number"
            min={5}
            value={durationMins}
            onChange={(e) => setDurationMins(Number(e.target.value))}
            className={inputClass}
          />
        </Field>
        <Field label="How">
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as typeof mode)}
            className={inputClass}
          >
            <option value="in_person">in person</option>
            <option value="video">video</option>
            <option value="phone">phone</option>
          </select>
        </Field>
      </div>

      <Field label="Where, or the link">
        <input
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          className={inputClass}
          placeholder="NH8 — meeting room 2"
        />
      </Field>

      <Field label="Questions to ask">
        <select
          value={questionSetId}
          onChange={(e) => setQuestionSetId(e.target.value)}
          className={inputClass}
        >
          <option value="">Choose for me — the set written for this round</option>
          {questionSets.map((set) => (
            <option key={set.id} value={set.id}>
              {set.name} ({set.count})
            </option>
          ))}
        </select>
      </Field>

      <Field label="Who is sitting in">
        <input
          value={search}
          onChange={(e) => void lookUp(e.target.value)}
          className={inputClass}
          placeholder="Start typing a colleague's name"
        />
      </Field>

      {results.length > 0 ? (
        <ul className="mt-2 divide-y divide-line rounded-lg border border-line">
          {results.map((colleague) => (
            <li key={colleague.id}>
              <button
                type="button"
                onClick={() => {
                  setPanel((p) =>
                    p.some((x) => x.id === colleague.id) ? p : [...p, colleague],
                  );
                  setSearch("");
                  setResults([]);
                }}
                className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-hover"
              >
                <span className="font-body text-sm text-white">{colleague.name}</span>
                <span className="font-body text-xs text-muted">
                  {colleague.jobTitle ?? colleague.email}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {panel.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-2">
          {panel.map((member, index) => (
            <li
              key={member.id}
              className="flex items-center gap-2 rounded-full border border-line px-3 py-1"
            >
              <span className="font-body text-xs text-white">
                {member.name}
                {index === 0 ? " · leads" : ""}
              </span>
              <button
                type="button"
                aria-label={`Remove ${member.name}`}
                onClick={() => setPanel((p) => p.filter((x) => x.id !== member.id))}
                className="font-body text-xs text-muted hover:text-alert"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <button type="submit" disabled={busy} className={primaryClass}>
        Put it in the diary
      </button>
    </form>
  );
}
