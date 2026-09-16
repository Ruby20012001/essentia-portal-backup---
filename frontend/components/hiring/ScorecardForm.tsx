"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Scorecard } from "@/lib/services/hiring";
import { Field, inputClass, primaryClass } from "@/components/hiring/HiringBoard";
import { RecommendationPill } from "@/components/hiring/CandidateFile";
import { when } from "@/components/hiring/RoundsList";

type Banner = { tone: "error" | "success"; message: string };
type Call = NonNullable<Scorecard["recommendation"]>;

const CALLS: { value: Call; label: string }[] = [
  { value: "strong_yes", label: "Strong yes" },
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
  { value: "strong_no", label: "Strong no" },
];

/**
 * Your own write-up of a round you sat in.
 *
 * Saving keeps a draft; submitting is one way, and the screen says so before
 * you press it. That is not caution for its own sake: what a scorecard is
 * worth is that it was written before you heard what everybody else thought,
 * and a form that lets you go back and soften it is worth nothing.
 */
export function ScorecardForm({
  interviewId,
  questions,
  existing,
}: {
  interviewId: string;
  questions: { id: string; seq: number; prompt: string; guidance: string | null }[];
  existing: Scorecard | null;
}) {
  const router = useRouter();
  const submitted = Boolean(existing?.submittedAt);

  const [call, setCall] = useState<Call | "">(existing?.recommendation ?? "");
  const [strengths, setStrengths] = useState(existing?.strengths ?? "");
  const [concerns, setConcerns] = useState(existing?.concerns ?? "");
  const [answers, setAnswers] = useState<
    Record<string, { rating: number | null; notes: string }>
  >(() => {
    const seed: Record<string, { rating: number | null; notes: string }> = {};
    for (const question of questions) {
      const prior = existing?.answers.find((a) => a.questionId === question.id);
      seed[question.id] = { rating: prior?.rating ?? null, notes: prior?.notes ?? "" };
    }
    return seed;
  });
  const [banner, setBanner] = useState<Banner | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(submit: boolean) {
    setBusy(true);
    setBanner(null);
    try {
      const res = await fetch(`/api/hiring/interviews/${interviewId}/scorecard`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recommendation: call || null,
          strengths: strengths || null,
          concerns: concerns || null,
          answers: Object.entries(answers).map(([questionId, value]) => ({
            questionId,
            rating: value.rating,
            notes: value.notes || null,
          })),
          submit,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setBanner({ tone: "error", message: data.error ?? `Request failed (${res.status})` });
        return;
      }
      setBanner({
        tone: "success",
        message: submit ? "Submitted. It is on the candidate's file now." : "Saved as a draft.",
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (submitted && existing) {
    return (
      <section className="mt-8 rounded-lg border border-line bg-card p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-heading text-2xl text-white">Your write-up</h2>
          <RecommendationPill call={existing.recommendation} />
        </div>
        <p className="mt-1 font-body text-sm font-light text-muted">
          Submitted {existing.submittedAt ? when(existing.submittedAt) : ""}. This is
          what you thought before you heard what anybody else thought, and it
          stays that way.
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
          : "No question set for this round — say what you made of the conversation."}
      </p>

      {banner ? (
        <div
          className={`mt-4 rounded-lg border-l-4 px-5 py-3 font-body text-sm ${
            banner.tone === "error"
              ? "border-alert bg-alert/5 text-alert"
              : "border-forest bg-forest/5 text-success"
          }`}
          role="status"
        >
          {banner.message}
        </div>
      ) : null}

      {questions.length > 0 ? (
        <ol className="mt-5 space-y-5">
          {questions.map((question) => (
            <li key={question.id} className="border-t border-line pt-4 first:border-0 first:pt-0">
              <p className="font-body text-[15px] text-white">{question.prompt}</p>
              {question.guidance ? (
                <p className="mt-0.5 font-body text-xs font-light text-muted">
                  {question.guidance}
                </p>
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
                          [question.id]: {
                            rating: active ? null : rating,
                            notes: a[question.id]?.notes ?? "",
                          },
                        }))
                      }
                      className={`h-9 w-9 rounded-lg border font-body text-sm font-bold ${
                        active
                          ? "border-forest bg-forest text-cream"
                          : "border-line text-white hover:bg-hover"
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
                    [question.id]: {
                      rating: a[question.id]?.rating ?? null,
                      notes: e.target.value,
                    },
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

        <Field label="Your call">
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
        </Field>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => void save(false)}
          className="rounded-lg border border-line px-4 py-2 font-body text-sm font-bold text-white hover:bg-hover disabled:opacity-40"
        >
          Save a draft
        </button>
        <button type="button" disabled={busy} onClick={() => void save(true)} className={primaryClass}>
          Submit
        </button>
        <span className="font-body text-xs font-light text-muted">
          Submitting is one way. Nothing changes it afterwards.
        </span>
      </div>
    </section>
  );
}
