"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Scorecard } from "@/lib/services/hiring";
import { scorecardSubmitRefusal, type RoundStatus } from "@/lib/services/hiring-logic";
import { formatIST } from "@/lib/format";
import {
  Field,
  Notice,
  RecommendationPill,
  ghostClass,
  inputClass,
  primaryClass,
  sendJson,
  type NoticeState,
} from "@/components/hiring/ui";

type Call = NonNullable<Scorecard["recommendation"]>;

const CALLS: { value: Call; label: string }[] = [
  { value: "strong_yes", label: "Strong yes" },
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
  { value: "strong_no", label: "Strong no" },
];

/**
 * Your own write-up of an interview you sat in.
 *
 * Saving keeps a draft; submitting is one way, available once the interview
 * has started, and the screen says so before you press it. What a write-up
 * is worth is that it was written after the conversation and before you heard
 * what everybody else thought — a form that lets you submit the day before,
 * or go back and soften it afterwards, is worth nothing.
 */
export function ScorecardForm({
  interviewId,
  questions,
  existing,
  submitBlocked,
  scheduledAt,
  status,
}: {
  interviewId: string;
  questions: { id: string; seq: number; prompt: string; guidance: string | null }[];
  existing: Scorecard | null;
  /** Worked out on the server when the page loaded… */
  submitBlocked: string | null;
  /** …and re-checked here, so a tab opened before the interview unlocks itself when it starts. */
  scheduledAt: string;
  status: RoundStatus;
}) {
  const router = useRouter();
  const submitted = Boolean(existing?.submittedAt);

  const [call, setCall] = useState<Call | "">(existing?.recommendation ?? "");
  const [strengths, setStrengths] = useState(existing?.strengths ?? "");
  const [concerns, setConcerns] = useState(existing?.concerns ?? "");
  const [answers, setAnswers] = useState<Record<string, { rating: number | null; notes: string }>>(() => {
    const seed: Record<string, { rating: number | null; notes: string }> = {};
    for (const question of questions) {
      const prior = existing?.answers.find((a) => a.questionId === question.id);
      seed[question.id] = { rating: prior?.rating ?? null, notes: prior?.notes ?? "" };
    }
    return seed;
  });
  const [notice, setNotice] = useState<NoticeState>(null);
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState<string | null>(submitBlocked);

  // Somebody who opened the interview beforehand to read the questions keeps
  // the tab open through the conversation. Submit has to unlock by itself when
  // the interview starts — a reload to unlock it would throw away the write-up.
  useEffect(() => {
    const check = () => setBlocked(scorecardSubmitRefusal({ status, scheduledAt }, Date.now()));
    check();
    const timer = window.setInterval(check, 30_000);
    return () => window.clearInterval(timer);
  }, [status, scheduledAt]);

  // If HR changes the questions while this form is open, the refresh brings
  // the new ones. Keep what was written against questions that are still
  // asked, drop the rest, and say so — rather than keep sending answers to
  // questions the interview no longer asks, which every save then refused.
  const questionKey = questions.map((q) => q.id).join(",");
  const firstKey = useRef(questionKey);
  useEffect(() => {
    setAnswers((current) => {
      const next: Record<string, { rating: number | null; notes: string }> = {};
      for (const question of questions) {
        next[question.id] = current[question.id] ?? { rating: null, notes: "" };
      }
      return next;
    });
    if (questionKey !== firstKey.current) {
      firstKey.current = questionKey;
      setNotice({
        tone: "error",
        message:
          "HR changed the questions for this interview. Your strengths, concerns and call are kept; " +
          "answer the questions below again.",
      });
    }
    // questions is derived from questionKey for this purpose
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionKey]);

  async function save(submit: boolean) {
    if (submit && !call) {
      setNotice({ tone: "error", message: "Choose your call — yes or no — before you submit." });
      return;
    }
    const callLabel = CALLS.find((c) => c.value === call)?.label ?? "";
    if (submit && !window.confirm(`Submit your write-up with the call “${callLabel}”? It cannot be changed afterwards.`)) {
      return;
    }
    setBusy(true);
    setNotice(null);
    const res = await sendJson(`/api/hiring/interviews/${interviewId}/scorecard`, "PUT", {
      recommendation: call || null,
      strengths: strengths || null,
      concerns: concerns || null,
      answers: questions.map((q) => ({
        questionId: q.id,
        rating: answers[q.id]?.rating ?? null,
        notes: answers[q.id]?.notes || null,
      })),
      submit,
    });
    setBusy(false);
    setNotice(
      res.ok
        ? { tone: "success", message: submit ? "Submitted. It is on the candidate's file now." : "Saved as a draft." }
        : { tone: "error", message: res.data.error ?? "" },
    );
    // Also after a refusal: if what is on the server moved on (it was submitted
    // from another tab, say), the page should show that rather than a live form.
    router.refresh();
  }

  if (submitted && existing) {
    return (
      <section className="mt-8 rounded-lg border border-line bg-card p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-heading text-2xl text-white">Your write-up</h2>
          <RecommendationPill call={existing.recommendation} />
        </div>
        <p className="mt-1 font-body text-sm font-light text-muted">
          Submitted {existing.submittedAt ? `${formatIST(existing.submittedAt)} IST` : ""}. This is what
          you thought before you heard what anybody else thought, and it stays that way.
        </p>
        {existing.strengths ? (
          <p className="mt-4 font-body text-sm font-light text-white">
            <span className="font-bold text-muted">Strengths. </span>
            {existing.strengths}
          </p>
        ) : null}
        {existing.concerns ? (
          <p className="mt-2 font-body text-sm font-light text-white">
            <span className="font-bold text-muted">Concerns. </span>
            {existing.concerns}
          </p>
        ) : null}
        {existing.answers.length > 0 ? (
          <ol className="mt-4 space-y-3 border-t border-line pt-4">
            {existing.answers.map((answer) => (
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
      </section>
    );
  }

  return (
    <section className="mt-8 rounded-lg border border-line bg-card p-5">
      <h2 className="font-heading text-2xl text-white">Your write-up</h2>
      <p className="mt-1 font-body text-sm font-light text-muted">
        {questions.length > 0
          ? "The same questions are asked of everybody against this seat, so two people can actually be compared."
          : "No question set for this interview — say what you made of the conversation."}
      </p>

      {questions.length > 0 ? (
        <ol className="mt-5 space-y-5">
          {questions.map((question) => (
            <li key={question.id} className="border-t border-line pt-4 first:border-0 first:pt-0">
              <p className="font-body text-[15px] text-white">
                {question.seq}. {question.prompt}
              </p>
              {question.guidance ? (
                <p className="mt-0.5 font-body text-xs font-light text-muted">{question.guidance}</p>
              ) : null}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {[1, 2, 3, 4].map((rating) => {
                  const active = answers[question.id]?.rating === rating;
                  return (
                    <button
                      key={rating}
                      type="button"
                      aria-pressed={active}
                      onClick={() =>
                        setAnswers((a) => ({
                          ...a,
                          [question.id]: { rating: active ? null : rating, notes: a[question.id]?.notes ?? "" },
                        }))
                      }
                      className={`h-9 w-9 rounded-lg border font-body text-sm font-bold ${
                        active ? "border-forest bg-forest text-cream" : "border-line text-white hover:bg-hover"
                      }`}
                    >
                      {rating}
                    </button>
                  );
                })}
                <span className="font-body text-xs font-light text-muted">1 poor · 4 excellent</span>
              </div>
              <textarea
                value={answers[question.id]?.notes ?? ""}
                onChange={(e) =>
                  setAnswers((a) => ({
                    ...a,
                    [question.id]: { rating: a[question.id]?.rating ?? null, notes: e.target.value },
                  }))
                }
                rows={2}
                placeholder="What they actually said."
                className={`mt-3 ${inputClass}`}
              />
            </li>
          ))}
        </ol>
      ) : null}

      <div className="mt-6 border-t border-line pt-4">
        <Field label="Strengths">
          <textarea
            value={strengths}
            onChange={(e) => setStrengths(e.target.value)}
            rows={3}
            className={inputClass}
            placeholder="What they would be good at here, with the evidence from the conversation."
          />
        </Field>
        <Field label="Concerns">
          <textarea
            value={concerns}
            onChange={(e) => setConcerns(e.target.value)}
            rows={3}
            className={inputClass}
            placeholder="What would worry you if they started on Monday."
          />
        </Field>
        {/* A group, not a <label>: a label forwards any click inside it to its
            first control, so clicking the gap beside "No" chose "Strong yes". */}
        <div role="group" aria-labelledby="scorecard-call-label" className="mt-3">
          <span
            id="scorecard-call-label"
            className="mb-1 block font-body text-[11px] font-bold uppercase tracking-[0.16em] text-muted"
          >
            Your call
          </span>
          <div className="flex flex-wrap gap-2">
            {CALLS.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={call === option.value}
                onClick={() => setCall(call === option.value ? "" : option.value)}
                className={`rounded-lg border px-3 py-2 font-body text-sm font-bold ${
                  call === option.value
                    ? option.value.endsWith("yes")
                      ? "border-forest bg-forest text-cream"
                      : "border-alert bg-alert text-cream"
                    : "border-line text-white hover:bg-hover"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <Notice notice={notice} />
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button type="button" disabled={busy} onClick={() => void save(false)} className={ghostClass}>
          Save a draft
        </button>
        <button
          type="button"
          disabled={busy || Boolean(blocked)}
          onClick={() => void save(true)}
          className={primaryClass}
        >
          Submit
        </button>
        <span className="font-body text-xs font-light text-muted">
          {blocked ?? "Submitting is one way. Nothing changes it afterwards."}
        </span>
      </div>
    </section>
  );
}
