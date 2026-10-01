"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ThemeToggle } from "@/components/shell/ThemeToggle";
import {
  SITE_STEPS,
  STAGES,
  TYPES,
  hasSiteWork,
  isLate,
  siteProgressPct,
  sortByDue,
  todayIST,
  type DeskProject,
  type Stage,
} from "@/lib/services/project-desk-logic";
import s from "./project-desk.module.css";

const POLL_MS = 15_000;
const FRIENDLY_ERROR = "The assistant could not answer just now. Try again.";

const QUICK_QUESTIONS = [
  {
    label: "What is late or due this week?",
    prompt: "Which projects are late or due in the next 7 days? List them with owner and next step.",
  },
  {
    label: "Weekly team update",
    prompt:
      "Write a short weekly update for the team: count by stage, what moved, what is stuck, and who needs to act.",
  },
  {
    label: "Proposal follow-ups",
    prompt:
      "Which proposals have been sent but not converted? Suggest a polite, formal follow-up message for each client.",
  },
  {
    label: "Site progress report",
    prompt:
      "For every project in Execution, give the site progress percentage, what site work is done, what is still pending, and what should happen next on site. Flag any project that is late.",
  },
  {
    label: "Team workload",
    prompt: "Who on the team has the most open projects? Is anyone overloaded?",
  },
];

type Filter = Stage | "Late" | null;

export function ProjectDesk({ initial, userName }: { initial: DeskProject[]; userName: string }) {
  const router = useRouter();
  const [projects, setProjects] = useState<DeskProject[]>(initial);
  const [filter, setFilter] = useState<Filter>(null);
  const [openSite, setOpenSite] = useState<number | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [today, setToday] = useState(() => todayIST());

  /* ---- the list refreshes for everyone, every 15 seconds ---- */
  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/project-desk/projects", { cache: "no-store" });
      if (res.status === 401) {
        router.refresh();
        return;
      }
      if (!res.ok) return;
      const data = (await res.json()) as { projects: DeskProject[] };
      setProjects(data.projects);
      setToday(todayIST());
    } catch {
      /* offline on site for a moment — the next poll will catch up */
    }
  }, [router]);

  useEffect(() => {
    const timer = window.setInterval(refresh, POLL_MS);
    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(t);
  }, [notice]);

  useEffect(() => {
    if (confirmRemove === null) return;
    const t = window.setTimeout(() => setConfirmRemove(null), 4000);
    return () => window.clearTimeout(t);
  }, [confirmRemove]);

  /* ---- saving ---- */
  function replace(p: DeskProject) {
    setProjects((all) => sortByDue(all.map((x) => (x.id === p.id ? p : x))));
  }

  async function save(id: number, change: Partial<DeskProject>) {
    const before = projects.find((p) => p.id === id);
    if (before) replace({ ...before, ...change });
    try {
      const res = await fetch(`/api/project-desk/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(change),
      });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { project: DeskProject };
      replace(data.project);
    } catch {
      if (before) replace(before);
      setNotice("That change did not save. Try again.");
    }
  }

  async function remove(p: DeskProject) {
    if (confirmRemove !== p.id) {
      setConfirmRemove(p.id);
      return;
    }
    setConfirmRemove(null);
    const res = await fetch(`/api/project-desk/projects/${p.id}`, { method: "DELETE" }).catch(
      () => null,
    );
    if (res && (res.ok || res.status === 404)) {
      setProjects((all) => all.filter((x) => x.id !== p.id));
      setNotice(`Removed ${p.name}`);
    } else {
      setNotice("Could not remove that project. Try again.");
    }
  }

  /* ---- what is shown ---- */
  const counts = Object.fromEntries(STAGES.map((st) => [st, 0])) as Record<Stage, number>;
  let lateCount = 0;
  for (const p of projects) {
    counts[p.stage] += 1;
    if (isLate(p, today)) lateCount += 1;
  }

  const shown = projects.filter((p) =>
    filter === null ? true : filter === "Late" ? isLate(p, today) : p.stage === filter,
  );

  return (
    <div className={s.root}>
      <header className={s.header}>
        <div>
          <h1 className={s.title}>Essentia Project Desk</h1>
          <p className={s.subtitle}>
            Every live project in one place, with an assistant that reads it for you.
          </p>
        </div>
        <div className={s.account}>
          <span className={s.who}>{userName}</span>
          <ThemeToggle className={s.toggle} />
          <button
            type="button"
            className={s.linkButton}
            onClick={async () => {
              await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
              router.refresh();
            }}
          >
            Sign out
          </button>
        </div>
      </header>

      <main className={s.main}>
        {/* ---------------- stage summary ---------------- */}
        <section className={s.cards} aria-label="Projects by stage">
          {STAGES.map((st) => (
            <button
              key={st}
              type="button"
              className={`${s.card} ${filter === st ? s.cardOn : ""}`}
              aria-pressed={filter === st}
              onClick={() => setFilter(filter === st ? null : st)}
            >
              <span className={s.cardCount}>{counts[st]}</span>
              <span className={s.cardLabel}>{st}</span>
            </button>
          ))}
          <button
            type="button"
            className={`${s.card} ${s.cardLate} ${filter === "Late" ? s.cardOn : ""}`}
            aria-pressed={filter === "Late"}
            onClick={() => setFilter(filter === "Late" ? null : "Late")}
          >
            <span className={s.cardCount}>{lateCount}</span>
            <span className={s.cardLabel}>Late</span>
          </button>
        </section>

        {/* ---------------- assistant ---------------- */}
        <Assistant />

        {/* ---------------- project list ---------------- */}
        <section className={s.panel}>
          <div className={s.panelHead}>
            <h2 className={s.h2}>Projects</h2>
            {filter ? (
              <button type="button" className={s.linkButton} onClick={() => setFilter(null)}>
                Showing {filter} · show all
              </button>
            ) : null}
          </div>

          {projects.length === 0 ? (
            <p className={s.empty}>No projects yet. Add your first one below.</p>
          ) : shown.length === 0 ? (
            <p className={s.empty}>Nothing here right now.</p>
          ) : (
            <div className={s.tableWrap}>
              <table className={s.table}>
                <thead>
                  <tr>
                    <th>Project</th>
                    <th>Type</th>
                    <th>Stage</th>
                    <th>Owner</th>
                    <th>Next step</th>
                    <th>Due</th>
                    <th>
                      <span className={s.srOnly}>Remove</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((p) => {
                    const late = isLate(p, today);
                    const site = hasSiteWork(p.stage);
                    const pct = siteProgressPct(p.site_work);
                    const open = openSite === p.id && site;
                    return (
                      <ProjectRows
                        key={p.id}
                        p={p}
                        late={late}
                        site={site}
                        pct={pct}
                        open={open}
                        confirming={confirmRemove === p.id}
                        onStage={(stage) => save(p.id, { stage })}
                        onEdit={(change) => save(p.id, change)}
                        onToggleSite={() => setOpenSite(open ? null : p.id)}
                        onTick={(key, on) => {
                          const next = on
                            ? [...p.site_work, key]
                            : p.site_work.filter((k) => k !== key);
                          save(p.id, {
                            site_work: SITE_STEPS.map((x) => x.key).filter((k) =>
                              next.includes(k),
                            ),
                          });
                        }}
                        onRemove={() => remove(p)}
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className={s.footnote}>
            Dates are India time (IST). The list refreshes by itself every 15 seconds.
          </p>
        </section>

        {/* ---------------- add a project ---------------- */}
        <AddProject
          onAdded={(p) => {
            setProjects((all) => sortByDue([...all.filter((x) => x.id !== p.id), p]));
            setNotice(`Added ${p.name}`);
          }}
        />
      </main>

      {notice ? (
        <div className={s.toast} role="status">
          {notice}
        </div>
      ) : null}
    </div>
  );
}

/* ====================================================================== */

function ProjectRows({
  p,
  late,
  site,
  pct,
  open,
  confirming,
  onStage,
  onEdit,
  onToggleSite,
  onTick,
  onRemove,
}: {
  p: DeskProject;
  late: boolean;
  site: boolean;
  pct: number;
  open: boolean;
  confirming: boolean;
  onStage: (stage: Stage) => void;
  onEdit: (change: Partial<DeskProject>) => void;
  onToggleSite: () => void;
  onTick: (key: DeskProject["site_work"][number], on: boolean) => void;
  onRemove: () => void;
}) {
  const where = [p.client, p.city].filter(Boolean).join(" · ");
  return (
    <>
      <tr className={open ? s.rowOpen : undefined}>
        <td>
          <div className={s.name}>{p.name}</div>
          {where ? <div className={s.sub}>{where}</div> : null}
        </td>
        <td>{p.type}</td>
        <td>
          <select
            className={s.select}
            value={p.stage}
            aria-label={`Stage of ${p.name}`}
            onChange={(e) => onStage(e.target.value as Stage)}
          >
            {STAGES.map((st) => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </select>
          {site ? (
            <div className={s.progress}>
              <div className={s.bar} aria-hidden>
                <div className={s.barFill} style={{ width: `${pct}%` }} />
              </div>
              <div className={s.sub}>{pct}% site work done</div>
              <button type="button" className={s.linkButton} onClick={onToggleSite}>
                {open ? "Close site work" : "Update site work"}
              </button>
            </div>
          ) : null}
        </td>
        <td>{p.owner ?? <span className={s.muted}>—</span>}</td>
        <td className={s.nextStep}>
          <EditableCell
            label={`Next step for ${p.name}`}
            value={p.next_step ?? ""}
            onSave={(v) => onEdit({ next_step: v })}
          >
            {p.next_step ?? <span className={s.muted}>Add next step</span>}
          </EditableCell>
        </td>
        <td className={late ? s.late : undefined}>
          <EditableCell
            label={`Due date for ${p.name}`}
            type="date"
            value={p.due_date ?? ""}
            onSave={(v) => onEdit({ due_date: v || null })}
          >
            {p.due_date ? formatDate(p.due_date) : <span className={s.muted}>Set date</span>}
            {late ? <span className={s.lateTag}>late</span> : null}
          </EditableCell>
        </td>
        <td>
          <button
            type="button"
            className={`${s.remove} ${confirming ? s.removeConfirm : ""}`}
            onClick={onRemove}
          >
            {confirming ? "Tap to confirm" : "Remove"}
          </button>
        </td>
      </tr>
      {open ? (
        <tr className={s.siteRow}>
          <td colSpan={7}>
            <div className={s.steps}>
              {SITE_STEPS.map((step) => {
                const on = p.site_work.includes(step.key);
                return (
                  <label key={step.key} className={`${s.step} ${on ? s.stepOn : ""}`}>
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={(e) => onTick(step.key, e.target.checked)}
                    />
                    <span>{step.label}</span>
                  </label>
                );
              })}
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

/** Shows the value; one tap turns it into a box, and leaving the box (or Enter) saves. */
function EditableCell({
  label,
  value,
  type = "text",
  onSave,
  children,
}: {
  label: string;
  value: string;
  type?: "text" | "date";
  onSave: (v: string) => void;
  children: React.ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (!editing) {
    return (
      <button
        type="button"
        className={s.cellButton}
        aria-label={`Change: ${label}`}
        onClick={() => {
          setDraft(value);
          setEditing(true);
        }}
      >
        {children}
      </button>
    );
  }

  const finish = () => {
    setEditing(false);
    if (draft.trim() !== value) onSave(draft.trim());
  };

  return (
    <input
      autoFocus
      className={s.input}
      type={type}
      aria-label={label}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={finish}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") setEditing(false);
      }}
    />
  );
}

/* ====================================================================== */

function Assistant() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [asked, setAsked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  async function ask(q: string, label?: string) {
    const text = q.trim();
    if (!text || busy) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setBusy(true);
    setAsked(label ?? text);
    setAnswer("");
    try {
      const res = await fetch("/api/project-desk/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        setAnswer(FRIENDLY_ERROR);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        setAnswer((a) => a + decoder.decode(value, { stream: true }));
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") setAnswer(FRIENDLY_ERROR);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={s.panel}>
      <h2 className={s.h2}>Ask the assistant</h2>
      <div className={s.quick}>
        {QUICK_QUESTIONS.map((q) => (
          <button
            key={q.label}
            type="button"
            className={s.chip}
            disabled={busy}
            onClick={() => ask(q.prompt, q.label)}
          >
            {q.label}
          </button>
        ))}
      </div>
      <form
        className={s.askRow}
        onSubmit={(e) => {
          e.preventDefault();
          ask(question);
        }}
      >
        <input
          className={s.input}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask anything about the projects"
          aria-label="Your question"
        />
        <button type="submit" className={s.primary} disabled={busy || !question.trim()}>
          {busy ? "Thinking…" : "Ask"}
        </button>
      </form>
      {asked ? (
        <div className={s.answer} aria-live="polite">
          <div className={s.answerQ}>{asked}</div>
          <div className={s.answerText}>
            {answer || (busy ? <span className={s.muted}>Reading the projects…</span> : null)}
          </div>
        </div>
      ) : null}
    </section>
  );
}

/* ====================================================================== */

const EMPTY_FORM = {
  name: "",
  client: "",
  city: "",
  type: "Residence" as (typeof TYPES)[number],
  stage: "Enquiry" as Stage,
  owner: "",
  next_step: "",
  due_date: "",
};

function AddProject({ onAdded }: { onAdded: (p: DeskProject) => void }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set =
    (k: keyof typeof EMPTY_FORM) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <section className={s.panel}>
      <h2 className={s.h2}>Add a project</h2>
      <form
        className={s.form}
        onSubmit={async (e) => {
          e.preventDefault();
          if (!form.name.trim()) {
            setError("Give the project a name.");
            return;
          }
          setBusy(true);
          setError(null);
          try {
            const res = await fetch("/api/project-desk/projects", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(form),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
              setError(data.error ?? "Could not add the project. Try again.");
              return;
            }
            onAdded(data.project as DeskProject);
            setForm(EMPTY_FORM);
          } catch {
            setError("Could not add the project. Try again.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="Project name" wide>
          <input className={s.input} value={form.name} onChange={set("name")} placeholder="701 B Magnolias" required />
        </Field>
        <Field label="Client">
          <input className={s.input} value={form.client} onChange={set("client")} />
        </Field>
        <Field label="City">
          <input className={s.input} value={form.city} onChange={set("city")} placeholder="Gurugram" list="pd-cities" />
          <datalist id="pd-cities">
            <option value="Gurugram" />
            <option value="Delhi" />
            <option value="Mumbai" />
            <option value="Hyderabad" />
          </datalist>
        </Field>
        <Field label="Type">
          <select className={s.select} value={form.type} onChange={set("type")}>
            {TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </Field>
        <Field label="Stage">
          <select className={s.select} value={form.stage} onChange={set("stage")}>
            {STAGES.map((st) => (
              <option key={st}>{st}</option>
            ))}
          </select>
        </Field>
        <Field label="Owner">
          <input className={s.input} value={form.owner} onChange={set("owner")} placeholder="Who is handling it" />
        </Field>
        <Field label="Next step" wide>
          <input className={s.input} value={form.next_step} onChange={set("next_step")} placeholder="Send revised proposal" />
        </Field>
        <Field label="Due date">
          <input className={s.input} type="date" value={form.due_date} onChange={set("due_date")} />
        </Field>
        <div className={s.formFoot}>
          <button type="submit" className={s.primary} disabled={busy}>
            {busy ? "Adding…" : "Add project"}
          </button>
          {error ? <span className={s.error}>{error}</span> : null}
        </div>
      </form>
    </section>
  );
}

function Field({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <label className={`${s.field} ${wide ? s.fieldWide : ""}`}>
      <span className={s.fieldLabel}>{label}</span>
      {children}
    </label>
  );
}

function formatDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
