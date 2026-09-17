"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type {
  CandidateSummary,
  Colleague,
  HiringRights,
  InterviewSummary,
  OpenRole,
  PriorApplication,
  Stage,
} from "@/lib/services/hiring";
import {
  EMPLOYMENT_LABEL,
  EMPLOYMENT_TYPES,
  LIMITS,
  lakhsToRupees,
  type EmploymentType,
} from "@/lib/services/hiring-logic";
import { formatIST, formatLakhs } from "@/lib/format";
import { RoundsList } from "@/components/hiring/RoundsList";
import {
  CandidateStatusPill,
  ColleaguePicker,
  Field,
  Notice,
  ghostClass,
  inputClass,
  pillClass,
  primaryClass,
  sendJson,
  type NoticeState,
} from "@/components/hiring/ui";

/**
 * The hiring board — seats, the people against them, and the diary.
 *
 * Every form carries its own message beside its own button. The service's
 * refusals are written as sentences for exactly this screen ("2 interviewers
 * have not written up a round…"), and they are only worth anything where the
 * person pressing the button can see them.
 */
export function HiringBoard({
  roles,
  candidates,
  upcoming,
  stages,
  departments,
  rights,
  viewer,
  showStopped,
}: {
  roles: OpenRole[];
  candidates: CandidateSummary[];
  upcoming: InterviewSummary[];
  stages: Stage[];
  departments: { id: string; name: string }[];
  rights: HiringRights;
  viewer: { id: string; name: string };
  showStopped: boolean;
}) {
  const router = useRouter();
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [addingRole, setAddingRole] = useState(false);
  const [editingRole, setEditingRole] = useState<string | null>(null);
  const [addingCandidate, setAddingCandidate] = useState<string | null>(null);
  const [seatNotices, setSeatNotices] = useState<Record<string, NoticeState>>({});
  const [busySeat, setBusySeat] = useState<string | null>(null);

  const shown = roleFilter === "all" ? candidates : candidates.filter((c) => c.roleId === roleFilter);

  async function setSeatStatus(role: OpenRole, status: string, confirm = false) {
    setBusySeat(role.id);
    const res = await sendJson<{ needsConfirm?: boolean }>(`/api/hiring/roles/${role.id}`, "PATCH", {
      status,
      confirm,
    });
    setBusySeat(null);
    if (res.status === 409 && res.data.needsConfirm) {
      if (window.confirm(res.data.error ?? "")) await setSeatStatus(role, status, true);
      else router.refresh();
      return;
    }
    setSeatNotices((n) => ({
      ...n,
      [role.id]: res.ok
        ? { tone: "success", message: `"${role.title}" is now ${status.replace("_", " ")}.` }
        : { tone: "error", message: res.data.error ?? "" },
    }));
    router.refresh();
  }

  return (
    <div className="space-y-10">
      <HowItWorks rights={rights} />

      {/* ── seats ───────────────────────────────────────────────────── */}
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-heading text-2xl text-white">Seats</h2>
            <p className="font-body text-xs font-light text-muted">A seat is a job opening — one role, for one or more people.</p>
          </div>
          {rights.add ? (
            <button type="button" onClick={() => setAddingRole((v) => !v)} className={ghostClass}>
              {addingRole ? "Cancel" : "Open a seat"}
            </button>
          ) : null}
        </div>

        {addingRole ? (
          <RoleForm
            departments={departments}
            submitLabel="Open the seat"
            onSubmit={async (input) => {
              const res = await sendJson("/api/hiring/roles", "POST", input);
              if (!res.ok) return res.data.error ?? "";
              setAddingRole(false);
              router.refresh();
              return null;
            }}
          />
        ) : null}

        {roles.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line-strong bg-card px-6 py-8 text-center font-body text-sm font-light text-muted">
            No seats yet.{" "}
            {rights.add ? "Click “Open a seat” above — every candidate is added against one." : "HR opens them."}
          </p>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {roles.map((role) => (
              <li key={role.id} className="rounded-lg border border-line bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-body text-[15px] font-bold text-white">{role.title}</h3>
                      <RoleStatusPill status={role.status} />
                    </div>
                    <p className="mt-0.5 font-body text-xs font-light text-muted">
                      {EMPLOYMENT_LABEL[role.employment]} · {role.department ?? "No department"} ·{" "}
                      {role.headcount} {role.headcount === 1 ? "person" : "people"}
                      {role.location ? ` · ${role.location}` : ""}
                    </p>
                    <p className="mt-0.5 font-body text-xs font-light text-muted">
                      Hiring lead: {role.hiringLead ?? "not named"}
                    </p>
                    <p className="mt-1 font-body text-xs text-muted">
                      {role.active} moving · {role.hired} hired
                      {role.stopped > 0 ? (
                        <>
                          {" · "}
                          <Link href="/hr?all=1" className="underline underline-offset-4 hover:text-white">
                            {role.stopped} stopped
                          </Link>
                        </>
                      ) : null}
                      {role.hired >= role.headcount && role.status === "open" ? (
                        <span className="text-amber-deep"> · every place is filled</span>
                      ) : null}
                    </p>
                    {role.notes ? (
                      <p className="mt-2 font-body text-xs font-light text-muted">{role.notes}</p>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-2">
                    {rights.add && (role.status === "open" || role.status === "on_hold") ? (
                      <button
                        type="button"
                        onClick={() => setAddingCandidate((v) => (v === role.id ? null : role.id))}
                        className={ghostClass}
                      >
                        {addingCandidate === role.id ? "Cancel" : "Add candidate"}
                      </button>
                    ) : null}
                    {rights.decide ? (
                      <>
                        <button
                          type="button"
                          onClick={() => setEditingRole((v) => (v === role.id ? null : role.id))}
                          className="font-body text-xs text-muted underline underline-offset-4 hover:text-white"
                        >
                          {editingRole === role.id ? "Close" : "Edit seat"}
                        </button>
                        <select
                          aria-label={`Status of ${role.title}`}
                          value={role.status}
                          disabled={busySeat === role.id}
                          onChange={(e) => void setSeatStatus(role, e.target.value)}
                          className="rounded-lg border border-line bg-card px-2 py-1 font-body text-xs text-white"
                        >
                          <option value="open">open</option>
                          <option value="on_hold">on hold</option>
                          <option value="filled">filled</option>
                          <option value="closed">closed</option>
                        </select>
                      </>
                    ) : rights.add ? (
                      <span className="max-w-[12rem] text-right font-body text-[11px] font-light text-muted">
                        Holding or closing a seat is for HR leads and founders.
                      </span>
                    ) : null}
                  </div>
                </div>

                <Notice notice={seatNotices[role.id] ?? null} />

                {editingRole === role.id ? (
                  <div className="mt-4 border-t border-line pt-4">
                    <RoleForm
                      departments={departments}
                      initial={role}
                      submitLabel="Save the seat"
                      onSubmit={async (input) => {
                        const res = await sendJson(`/api/hiring/roles/${role.id}`, "PATCH", input);
                        if (!res.ok) return res.data.error ?? "";
                        setEditingRole(null);
                        setSeatNotices((n) => ({ ...n, [role.id]: { tone: "success", message: "Seat saved." } }));
                        router.refresh();
                        return null;
                      }}
                    />
                  </div>
                ) : null}

                {addingCandidate === role.id ? (
                  <CandidateForm
                    onAdded={(name) => {
                      setAddingCandidate(null);
                      setSeatNotices((n) => ({
                        ...n,
                        [role.id]: { tone: "success", message: `${name} is on the board, under People moving.` },
                      }));
                      router.refresh();
                    }}
                    roleId={role.id}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── the people ──────────────────────────────────────────────── */}
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-heading text-2xl text-white">
              {showStopped ? "Everybody" : "People moving"}
            </h2>
            <p className="font-body text-xs font-light text-muted">
              Open a candidate to schedule an interview, move them on, or decide.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={showStopped ? "/hr" : "/hr?all=1"}
              className="font-body text-sm text-muted underline underline-offset-4 hover:text-white"
            >
              {showStopped ? "Hide people who stopped" : "Show people who stopped"}
            </Link>
            <select
              aria-label="Filter by seat"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="rounded-lg border border-line bg-card px-3 py-2 font-body text-sm text-white"
            >
              <option value="all">Every seat</option>
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.title}
                </option>
              ))}
            </select>
          </div>
        </div>

        {shown.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line-strong bg-card px-6 py-8 text-center font-body text-sm font-light text-muted">
            {roles.length === 0
              ? "Open a seat first, then add candidates to it."
              : rights.add
                ? "Nobody here yet. Click “Add candidate” on a seat above."
                : "Nobody here yet."}
          </p>
        ) : (
          <ul className="space-y-3">
            {shown.map((candidate) => (
              <li key={candidate.id} className="rounded-lg border border-line bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/hr/candidates/${candidate.id}`}
                        className="font-body text-[15px] font-bold text-white underline-offset-4 hover:underline"
                      >
                        {candidate.name}
                      </Link>
                      <span className={`${pillClass} bg-white/5 text-muted`}>{candidate.stageLabel}</span>
                      <CandidateStatusPill status={candidate.status} />
                      {candidate.feedbackOutstanding > 0 ? (
                        <span className={`${pillClass} bg-amber/10 text-amber-deep`}>
                          {candidate.feedbackOutstanding} write-up{candidate.feedbackOutstanding === 1 ? "" : "s"} owed
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 font-body text-xs font-light text-muted">
                      {candidate.roleTitle}
                      {candidate.source ? ` · ${candidate.source}` : ""}
                      {candidate.noticeDays != null ? ` · ${candidate.noticeDays} days' notice` : ""}
                      {candidate.expectedCtc != null ? ` · asking ${formatLakhs(candidate.expectedCtc)}` : ""}
                    </p>
                    <p className="mt-1 font-body text-xs font-light text-muted">
                      {candidate.outcomeNote && !["active", "offered"].includes(candidate.status)
                        ? candidate.outcomeNote
                        : candidate.nextRoundAt
                          ? `Next interview ${formatIST(candidate.nextRoundAt)} IST`
                          : "No interview scheduled"}
                    </p>
                  </div>
                  <Link href={`/hr/candidates/${candidate.id}`} className={ghostClass}>
                    Open
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── the diary ───────────────────────────────────────────────── */}
      <section>
        <h2 className="mb-3 font-heading text-2xl text-white">Interviews coming up</h2>
        <RoundsList
          rounds={upcoming}
          viewerId={viewer.id}
          canManage={rights.add}
          canView={rights.see}
          emptyMessage="No interviews scheduled. They are scheduled from a candidate's page."
        />
      </section>

      <p className="font-body text-xs font-light text-muted">
        Stages: {stages.map((s) => s.label).join(" → ")}. Moving somebody to {stages.at(-1)?.label ?? "the last stage"} makes the offer.
      </p>
    </div>
  );
}

function HowItWorks({ rights }: { rights: HiringRights }) {
  if (!rights.add) return null;
  const steps = [
    ["Open a seat", "the job you are hiring for."],
    ["Add candidate", "on that seat — name, and an email or phone."],
    ["Schedule an interview", "open the candidate, then “Schedule an interview”, and pick who sits in."],
    ["Write it up", "each interviewer opens it from “Your interviews” on this page after the conversation."],
    ["Decide", "on the candidate's page: move them on, make the offer, hire, or stop."],
  ];
  return (
    <ol className="grid gap-2 rounded-lg border border-line bg-card p-4 sm:grid-cols-2 lg:grid-cols-5">
      {steps.map(([title, text], i) => (
        <li key={title} className="font-body text-xs font-light text-muted">
          <span className="block font-bold text-white">
            {i + 1}. {title}
          </span>
          {text}
        </li>
      ))}
    </ol>
  );
}

function RoleStatusPill({ status }: { status: OpenRole["status"] }) {
  const tone =
    status === "open"
      ? "bg-success/10 text-success"
      : status === "on_hold"
        ? "bg-amber/10 text-amber-deep"
        : "bg-white/5 text-muted";
  return <span className={`${pillClass} ${tone}`}>{status.replace("_", " ")}</span>;
}

type RolePayload = {
  title: string;
  departmentId: string | null;
  headcount: number;
  location: string | null;
  employment: EmploymentType;
  hiringLead: string | null;
  notes: string | null;
};

function RoleForm({
  departments,
  initial,
  submitLabel,
  onSubmit,
}: {
  departments: { id: string; name: string }[];
  initial?: OpenRole;
  submitLabel: string;
  /** Resolves to an error sentence, or null when it went through. */
  onSubmit: (input: RolePayload) => Promise<string | null>;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [departmentId, setDepartmentId] = useState(initial?.departmentId ?? "");
  const [headcount, setHeadcount] = useState(String(initial?.headcount ?? 1));
  const [location, setLocation] = useState(initial?.location ?? "");
  const [employment, setEmployment] = useState<EmploymentType>(initial?.employment ?? "full_time");
  const [lead, setLead] = useState<Colleague[]>(
    initial?.hiringLeadId && initial.hiringLead
      ? [{ id: initial.hiringLeadId, name: initial.hiringLead, email: "", jobTitle: null }]
      : [],
  );
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [notice, setNotice] = useState<NoticeState>(null);
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="mb-4 rounded-lg border border-line bg-card p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setNotice(null);
        const error = await onSubmit({
          title,
          departmentId: departmentId || null,
          headcount: Number(headcount),
          location: location || null,
          employment,
          hiringLead: lead[0]?.id ?? null,
          notes: notes || null,
        });
        setBusy(false);
        if (error) setNotice({ tone: "error", message: error });
      }}
    >
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Job title">
          <input
            required
            maxLength={LIMITS.roleTitle}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={inputClass}
            placeholder="Junior Draughtsman"
          />
        </Field>
        <Field label="Department">
          <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} className={inputClass}>
            <option value="">Not said</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="How many people">
          <input
            type="number"
            min={1}
            step={1}
            required
            value={headcount}
            onChange={(e) => setHeadcount(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Employment">
          <select
            value={employment}
            onChange={(e) => setEmployment(e.target.value as EmploymentType)}
            className={inputClass}
          >
            {EMPLOYMENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {EMPLOYMENT_LABEL[t]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Where">
          <input
            maxLength={LIMITS.roleLocation}
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className={inputClass}
            placeholder="Gurugram"
          />
        </Field>
      </div>
      <Field label="Hiring lead" hint="The head who owns this seat. Optional.">
        <ColleaguePicker value={lead} onChange={setLead} multiple={false} />
      </Field>
      <Field label="Why this seat exists">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className={inputClass}
          placeholder="What breaks today because nobody is doing this."
        />
      </Field>
      <Notice notice={notice} />
      <button type="submit" disabled={busy} className={`mt-4 ${primaryClass}`}>
        {busy ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}

const SOURCES = ["referral", "naukri", "linkedin", "walk-in", "campus", "consultant"];

function CandidateForm({ roleId, onAdded }: { roleId: string; onAdded: (name: string) => void }) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [source, setSource] = useState("");
  const [asking, setAsking] = useState("");
  const [current, setCurrent] = useState("");
  const [noticeDays, setNoticeDays] = useState("");
  const [resumeUrl, setResumeUrl] = useState("");
  const [notice, setNotice] = useState<NoticeState>(null);
  const [duplicates, setDuplicates] = useState<PriorApplication[]>([]);
  const [busy, setBusy] = useState(false);

  async function submit(confirmDuplicate: boolean) {
    setNotice(null);
    if (!email.trim() && !phone.trim()) {
      setNotice({ tone: "error", message: "Give an email address or a phone number — at least one." });
      return;
    }
    const expectedCtc = lakhsToRupees(asking);
    const currentCtc = lakhsToRupees(current);
    if (Number.isNaN(expectedCtc) || Number.isNaN(currentCtc)) {
      setNotice({ tone: "error", message: "Salary is a number of lakhs, like 5.4." });
      return;
    }
    setBusy(true);
    const res = await sendJson<{ duplicates?: PriorApplication[] }>("/api/hiring/candidates", "POST", {
      roleId,
      fullName,
      email: email || null,
      phone: phone || null,
      source: source || null,
      expectedCtc,
      currentCtc,
      noticeDays: noticeDays ? Number(noticeDays) : null,
      resumeUrl: resumeUrl || null,
      confirmDuplicate,
    });
    setBusy(false);
    if (res.ok) {
      onAdded(fullName.trim());
      return;
    }
    setDuplicates(res.status === 409 ? (res.data.duplicates ?? []) : []);
    setNotice({ tone: "error", message: res.data.error ?? "" });
  }

  return (
    <form
      className="mt-4 border-t border-line pt-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit(false);
      }}
    >
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Name">
          <input
            required
            maxLength={LIMITS.candidateName}
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Where they came from">
          <input
            list="hiring-sources"
            maxLength={LIMITS.source}
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className={inputClass}
            placeholder="referral, naukri, walk-in…"
          />
          <datalist id="hiring-sources">
            {SOURCES.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </Field>
        <Field label="Email" hint="An email or a phone — at least one.">
          <input
            type="email"
            maxLength={LIMITS.email}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Phone">
          <input
            type="tel"
            maxLength={LIMITS.phone}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={inputClass}
            placeholder="+91 98100 12345"
          />
        </Field>
        <Field label="Asking (₹ lakh a year)">
          <input
            type="number"
            min={0}
            step="0.01"
            inputMode="decimal"
            value={asking}
            onChange={(e) => setAsking(e.target.value)}
            className={inputClass}
            placeholder="5.4"
          />
        </Field>
        <Field label="Earns now (₹ lakh a year)">
          <input
            type="number"
            min={0}
            step="0.01"
            inputMode="decimal"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            className={inputClass}
            placeholder="4.2"
          />
        </Field>
        <Field label="Notice (days)">
          <input
            type="number"
            min={0}
            max={365}
            step={1}
            value={noticeDays}
            onChange={(e) => setNoticeDays(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="CV (link)" hint="A Google Drive or OneDrive link. The file itself is not stored here.">
          <input
            inputMode="url"
            value={resumeUrl}
            onChange={(e) => setResumeUrl(e.target.value)}
            className={inputClass}
            placeholder="https://drive.google.com/…"
          />
        </Field>
      </div>

      <Notice notice={notice} />
      {duplicates.length > 0 ? (
        <div className="mt-3 rounded-lg border border-line p-3">
          <p className="font-body text-xs font-bold uppercase tracking-[0.16em] text-muted">Applied before</p>
          <ul className="mt-2 space-y-1">
            {duplicates.map((d) => (
              <li key={d.id} className="font-body text-sm text-white">
                <Link href={`/hr/candidates/${d.id}`} className="underline underline-offset-4" target="_blank">
                  {d.name}
                </Link>{" "}
                <span className="text-xs font-light text-muted">
                  — {d.roleTitle} · {d.status} at {d.stageLabel}
                  {d.outcomeNote ? ` · “${d.outcomeNote}”` : ""}
                </span>
              </li>
            ))}
          </ul>
          <button type="button" disabled={busy} className={`mt-3 ${ghostClass}`} onClick={() => void submit(true)}>
            Add as a new application anyway
          </button>
        </div>
      ) : null}

      <button type="submit" disabled={busy} className={`mt-4 ${primaryClass}`}>
        {busy ? "Adding…" : "Add to the board"}
      </button>
    </form>
  );
}
