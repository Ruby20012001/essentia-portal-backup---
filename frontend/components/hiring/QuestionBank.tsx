"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { QuestionSet, Stage } from "@/lib/services/hiring";
import { LIMITS } from "@/lib/services/hiring-logic";
import {
  Field,
  Notice,
  ghostClass,
  inputClass,
  pillClass,
  primaryClass,
  sendJson,
  type NoticeState,
} from "@/components/hiring/ui";

type Draft = { prompt: string; guidance: string };

/**
 * The sets of questions, and the form for writing or correcting one.
 *
 * A set nobody has used yet can be rewritten. Once an interview uses it, its
 * questions are what that interview's write-ups answer, so it can only be
 * retired and replaced — and a retired set is never chosen again.
 */
export function QuestionBank({
  sets,
  stages,
  roles,
  canAdd,
}: {
  sets: QuestionSet[];
  stages: Stage[];
  roles: { id: string; title: string }[];
  canAdd: boolean;
}) {
  const router = useRouter();
  const [writing, setWriting] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [notices, setNotices] = useState<Record<string, NoticeState>>({});
  const [busy, setBusy] = useState<string | null>(null);

  async function setActive(set: QuestionSet, isActive: boolean) {
    setBusy(set.id);
    const res = await sendJson(`/api/hiring/question-sets/${set.id}`, "PATCH", { isActive });
    setBusy(null);
    setNotices((n) => ({
      ...n,
      [set.id]: res.ok
        ? { tone: "success", message: isActive ? "Restored — it can be chosen again." : "Retired — it will not be chosen for new interviews." }
        : { tone: "error", message: res.data.error ?? "" },
    }));
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {canAdd ? (
        <button type="button" onClick={() => setWriting((v) => !v)} className={ghostClass}>
          {writing ? "Cancel" : "Write a set"}
        </button>
      ) : null}

      {writing ? (
        <SetForm
          stages={stages}
          roles={roles}
          submitLabel="Save the set"
          onSubmit={async (payload) => {
            const res = await sendJson("/api/hiring/question-sets", "POST", payload);
            if (!res.ok) return res.data.error ?? "";
            setWriting(false);
            router.refresh();
            return null;
          }}
        />
      ) : null}

      {sets.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line-strong bg-card px-6 py-12 text-center font-body text-sm font-light text-muted">
          No sets yet. An interview with no set is a conversation, which is fine for a first
          call and poor for a technical round.
        </p>
      ) : (
        <ul className="space-y-4">
          {sets.map((set) => (
            <li key={set.id} className={`rounded-lg border border-line bg-card p-5 ${set.isActive ? "" : "opacity-70"}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-body text-[15px] font-bold text-white">{set.name}</h2>
                    <span className={`${pillClass} bg-white/5 text-muted`}>{set.stageLabel ?? "any interview"}</span>
                    <span className={`${pillClass} bg-white/5 text-muted`}>{set.roleTitle ?? "any seat"}</span>
                    {!set.isActive ? <span className={`${pillClass} bg-alert/10 text-alert`}>retired</span> : null}
                  </div>
                  <p className="mt-0.5 font-body text-xs font-light text-muted">
                    {set.roundsUsing === 0
                      ? "Not used by any interview yet"
                      : `Used by ${set.roundsUsing} interview${set.roundsUsing === 1 ? "" : "s"}`}
                  </p>
                </div>
                {canAdd ? (
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {set.roundsUsing === 0 ? (
                      <button
                        type="button"
                        className={ghostClass}
                        onClick={() => setEditing((v) => (v === set.id ? null : set.id))}
                      >
                        {editing === set.id ? "Close" : "Edit"}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      disabled={busy === set.id}
                      className={ghostClass}
                      onClick={() => void setActive(set, !set.isActive)}
                    >
                      {set.isActive ? "Retire" : "Restore"}
                    </button>
                  </div>
                ) : null}
              </div>

              <Notice notice={notices[set.id] ?? null} />

              {editing === set.id ? (
                <div className="mt-4 border-t border-line pt-4">
                  <SetForm
                    stages={stages}
                    roles={roles}
                    initial={set}
                    submitLabel="Save the changes"
                    onSubmit={async (payload) => {
                      const res = await sendJson(`/api/hiring/question-sets/${set.id}`, "PATCH", payload);
                      if (!res.ok) return res.data.error ?? "";
                      setEditing(null);
                      setNotices((n) => ({ ...n, [set.id]: { tone: "success", message: "Saved." } }));
                      router.refresh();
                      return null;
                    }}
                  />
                </div>
              ) : (
                <ol className="mt-3 space-y-3">
                  {set.questions.map((question) => (
                    <li key={question.id}>
                      <p className="font-body text-[13px] text-white">
                        {question.seq}. {question.prompt}
                      </p>
                      {question.guidance ? (
                        <p className="mt-0.5 font-body text-xs font-light text-muted">{question.guidance}</p>
                      ) : null}
                    </li>
                  ))}
                </ol>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type SetPayload = {
  name: string;
  stageCode: string | null;
  roleId: string | null;
  questions: { prompt: string; guidance: string | null }[];
};

function SetForm({
  stages,
  roles,
  initial,
  submitLabel,
  onSubmit,
}: {
  stages: Stage[];
  roles: { id: string; title: string }[];
  initial?: QuestionSet;
  submitLabel: string;
  onSubmit: (payload: SetPayload) => Promise<string | null>;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [stageCode, setStageCode] = useState(initial?.stageCode ?? "");
  const [roleId, setRoleId] = useState(initial?.roleId ?? "");
  const [drafts, setDrafts] = useState<Draft[]>(
    initial
      ? initial.questions.map((q) => ({ prompt: q.prompt, guidance: q.guidance ?? "" }))
      : [{ prompt: "", guidance: "" }],
  );
  const [notice, setNotice] = useState<NoticeState>(null);
  const [busy, setBusy] = useState(false);

  function update(index: number, patch: Partial<Draft>) {
    setDrafts((d) => d.map((x, i) => (i === index ? { ...x, ...patch } : x)));
  }
  function move(index: number, by: -1 | 1) {
    setDrafts((d) => {
      const to = index + by;
      if (to < 0 || to >= d.length) return d;
      const next = [...d];
      [next[index], next[to]] = [next[to], next[index]];
      return next;
    });
  }

  return (
    <form
      className="rounded-lg border border-line bg-card p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setNotice(null);
        const orphan = drafts.findIndex((d) => !d.prompt.trim() && d.guidance.trim());
        if (orphan >= 0) {
          setNotice({
            tone: "error",
            message: `Question ${orphan + 1} has guidance but no question. Write the question, or clear the guidance.`,
          });
          return;
        }
        if (!drafts.some((d) => d.prompt.trim())) {
          setNotice({ tone: "error", message: "Write at least one question." });
          return;
        }
        setBusy(true);
        const error = await onSubmit({
          name,
          stageCode: stageCode || null,
          roleId: roleId || null,
          questions: drafts
            .filter((d) => d.prompt.trim())
            .map((d) => ({ prompt: d.prompt, guidance: d.guidance || null })),
        });
        setBusy(false);
        if (error) setNotice({ tone: "error", message: error });
      }}
    >
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="Name">
          <input
            required
            maxLength={LIMITS.setName}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
            placeholder="Drafting — department interview"
          />
        </Field>
        <Field label="For which interview">
          <select value={stageCode} onChange={(e) => setStageCode(e.target.value)} className={inputClass}>
            <option value="">Any interview</option>
            {stages
              .filter((s) => !s.isFinal)
              .map((s) => (
                <option key={s.code} value={s.code}>
                  {s.label}
                </option>
              ))}
          </select>
        </Field>
        <Field label="For which seat">
          <select value={roleId} onChange={(e) => setRoleId(e.target.value)} className={inputClass}>
            <option value="">Any seat</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.title}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <p className="mt-2 font-body text-xs font-light text-muted">
        When an interview is scheduled, the most specific set is used: this seat and this
        interview, then this interview for any seat, then this seat for any interview, then a
        general set.
      </p>

      <ol className="mt-5 space-y-4">
        {drafts.map((draft, index) => (
          <li key={index} className="border-t border-line pt-4 first:border-0 first:pt-0">
            <div className="flex items-center justify-between gap-2">
              <span className="font-body text-[11px] font-bold uppercase tracking-[0.16em] text-muted">
                Question {index + 1}
              </span>
              <span className="flex gap-1">
                <button type="button" aria-label={`Move question ${index + 1} up`} disabled={index === 0} onClick={() => move(index, -1)} className="px-2 font-body text-sm text-muted hover:text-white disabled:opacity-30">
                  ↑
                </button>
                <button type="button" aria-label={`Move question ${index + 1} down`} disabled={index === drafts.length - 1} onClick={() => move(index, 1)} className="px-2 font-body text-sm text-muted hover:text-white disabled:opacity-30">
                  ↓
                </button>
                <button
                  type="button"
                  aria-label={`Remove question ${index + 1}`}
                  disabled={drafts.length === 1}
                  onClick={() => setDrafts((d) => d.filter((_, i) => i !== index))}
                  className="px-2 font-body text-sm text-muted hover:text-alert disabled:opacity-30"
                >
                  Remove
                </button>
              </span>
            </div>
            <textarea
              value={draft.prompt}
              onChange={(e) => update(index, { prompt: e.target.value })}
              rows={2}
              className={`mt-1 ${inputClass}`}
              placeholder="What you want to know, in the words you will use."
            />
            <Field label="What a good answer sounds like">
              <input
                value={draft.guidance}
                onChange={(e) => update(index, { guidance: e.target.value })}
                className={inputClass}
                placeholder="For whoever asks it next."
              />
            </Field>
          </li>
        ))}
      </ol>

      <button
        type="button"
        onClick={() => setDrafts((d) => [...d, { prompt: "", guidance: "" }])}
        className={`mt-4 ${ghostClass}`}
      >
        One more question
      </button>

      <Notice notice={notice} />
      <div>
        <button type="submit" disabled={busy} className={`mt-4 ${primaryClass}`}>
          {busy ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
