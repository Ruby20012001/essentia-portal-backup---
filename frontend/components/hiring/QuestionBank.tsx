"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { QuestionSet, Stage } from "@/lib/services/hiring";
import { Field, inputClass, primaryClass } from "@/components/hiring/HiringBoard";

type Banner = { tone: "error" | "success"; message: string };
type Draft = { prompt: string; guidance: string };

/**
 * The sets of questions, and a form for writing a new one.
 *
 * Questions are typed in the order they will be asked and stored that way. An
 * order that drifts between two candidates is the same problem as no questions
 * at all: the two conversations stop being comparable.
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
  const [banner, setBanner] = useState<Banner | null>(null);
  const [busy, setBusy] = useState(false);
  const [writing, setWriting] = useState(false);

  const [name, setName] = useState("");
  const [stageCode, setStageCode] = useState("");
  const [roleId, setRoleId] = useState("");
  const [drafts, setDrafts] = useState<Draft[]>([{ prompt: "", guidance: "" }]);

  async function create() {
    setBusy(true);
    setBanner(null);
    try {
      const res = await fetch("/api/hiring/question-sets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          stageCode: stageCode || null,
          roleId: roleId || null,
          questions: drafts
            .filter((d) => d.prompt.trim())
            .map((d) => ({ prompt: d.prompt, guidance: d.guidance || null })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setBanner({ tone: "error", message: data.error ?? `Request failed (${res.status})` });
        return;
      }
      setBanner({ tone: "success", message: `"${name}" is in the bank.` });
      setName("");
      setStageCode("");
      setRoleId("");
      setDrafts([{ prompt: "", guidance: "" }]);
      setWriting(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
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

      {canAdd ? (
        <button
          type="button"
          onClick={() => setWriting((v) => !v)}
          className="rounded-lg border border-line px-4 py-2 font-body text-sm font-bold text-white hover:bg-hover"
        >
          {writing ? "Cancel" : "Write a set"}
        </button>
      ) : null}

      {writing ? (
        <form
          className="rounded-lg border border-line bg-card p-5"
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
        >
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="Name">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputClass}
                placeholder="Drafting — department round"
              />
            </Field>
            <Field label="For which stage">
              <select
                value={stageCode}
                onChange={(e) => setStageCode(e.target.value)}
                className={inputClass}
              >
                <option value="">Any stage</option>
                {stages.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="For which seat">
              <select
                value={roleId}
                onChange={(e) => setRoleId(e.target.value)}
                className={inputClass}
              >
                <option value="">Any seat</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <ol className="mt-5 space-y-4">
            {drafts.map((draft, index) => (
              <li key={index} className="border-t border-line pt-4 first:border-0 first:pt-0">
                <Field label={`Question ${index + 1}`}>
                  <textarea
                    value={draft.prompt}
                    onChange={(e) =>
                      setDrafts((d) =>
                        d.map((x, i) => (i === index ? { ...x, prompt: e.target.value } : x)),
                      )
                    }
                    rows={2}
                    className={inputClass}
                    placeholder="What you want to know, in the words you will use."
                  />
                </Field>
                <Field label="What a good answer sounds like">
                  <input
                    value={draft.guidance}
                    onChange={(e) =>
                      setDrafts((d) =>
                        d.map((x, i) => (i === index ? { ...x, guidance: e.target.value } : x)),
                      )
                    }
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
            className="mt-4 rounded-lg border border-line px-3 py-2 font-body text-sm font-bold text-white hover:bg-hover"
          >
            One more question
          </button>

          <div>
            <button type="submit" disabled={busy} className={primaryClass}>
              Save the set
            </button>
          </div>
        </form>
      ) : null}

      {sets.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line-strong bg-card px-6 py-12 text-center font-body text-sm font-light text-muted">
          No sets yet. A round with no set is a conversation, which is fine for
          a first call and poor for a technical round.
        </p>
      ) : (
        <ul className="space-y-4">
          {sets.map((set) => (
            <li key={set.id} className="rounded-lg border border-line bg-card p-5">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-body text-[15px] font-bold text-white">{set.name}</h2>
                {set.stageLabel ? (
                  <span className="rounded-full bg-white/5 px-2 py-0.5 font-body text-[10px] font-bold uppercase tracking-wide text-muted">
                    {set.stageLabel}
                  </span>
                ) : null}
                {set.roleTitle ? (
                  <span className="rounded-full bg-white/5 px-2 py-0.5 font-body text-[10px] font-bold uppercase tracking-wide text-muted">
                    {set.roleTitle}
                  </span>
                ) : null}
                {!set.isActive ? (
                  <span className="rounded-full bg-alert/10 px-2 py-0.5 font-body text-[10px] font-bold uppercase tracking-wide text-alert">
                    retired
                  </span>
                ) : null}
              </div>

              <ol className="mt-3 space-y-3">
                {set.questions.map((question) => (
                  <li key={question.id}>
                    <p className="font-body text-[13px] text-white">
                      {question.seq}. {question.prompt}
                    </p>
                    {question.guidance ? (
                      <p className="mt-0.5 font-body text-xs font-light text-muted">
                        {question.guidance}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ol>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
