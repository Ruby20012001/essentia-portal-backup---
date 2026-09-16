"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type {
  CandidateSummary,
  HiringRights,
  InterviewSummary,
  OpenRole,
  Stage,
} from "@/lib/services/hiring";
import { RoundsList, when } from "@/components/hiring/RoundsList";
import { formatINR } from "@/lib/format";

type Banner = { tone: "error" | "success"; message: string };

/**
 * The hiring board — seats down one side, the people against them on the
 * other, and the diary underneath.
 *
 * Refusals surface verbatim. The service says things like "3 interviewers have
 * not written up a round that has already happened", and that sentence is more
 * use to whoever is standing at this screen than any wording invented here.
 */
export function HiringBoard({
  roles,
  candidates,
  upcoming,
  stages,
  departments,
  rights,
}: {
  roles: OpenRole[];
  candidates: CandidateSummary[];
  upcoming: InterviewSummary[];
  stages: Stage[];
  departments: { id: string; name: string }[];
  rights: HiringRights;
}) {
  const router = useRouter();
  const [banner, setBanner] = useState<Banner | null>(null);
  const [busy, setBusy] = useState(false);
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [addingRole, setAddingRole] = useState(false);
  const [addingCandidate, setAddingCandidate] = useState<string | null>(null);

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
      router.refresh();
      return true;
    } finally {
      setBusy(false);
    }
  }

  const shown =
    roleFilter === "all"
      ? candidates
      : candidates.filter((c) => c.roleId === roleFilter);

  return (
    <div className="space-y-10">
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

      {/* ── seats ───────────────────────────────────────────────────── */}
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-heading text-2xl text-white">Seats</h2>
          {rights.add ? (
            <button
              type="button"
              onClick={() => setAddingRole((v) => !v)}
              className="rounded-lg border border-line px-4 py-2 font-body text-sm font-bold text-white hover:bg-hover"
            >
              {addingRole ? "Cancel" : "Open a seat"}
            </button>
          ) : null}
        </div>

        {addingRole ? (
          <RoleForm
            departments={departments}
            busy={busy}
            onSubmit={async (input) => {
              const ok = await send("/api/hiring/roles", "POST", input, `"${input.title}" is open.`);
              if (ok) setAddingRole(false);
            }}
          />
        ) : null}

        {roles.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line-strong bg-card px-6 py-8 text-center font-body text-sm font-light text-muted">
            No seats yet. Opening one is the first thing that happens here.
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
                      {role.department ?? "No department"} · {role.headcount} seat
                      {role.headcount === 1 ? "" : "s"}
                      {role.location ? ` · ${role.location}` : ""}
                      {role.hiringLead ? ` · ${role.hiringLead}` : ""}
                    </p>
                    <p className="mt-1 font-body text-xs text-muted">
                      {role.active} moving · {role.hired} hired
                    </p>
                    {role.notes ? (
                      <p className="mt-2 font-body text-xs font-light text-muted">{role.notes}</p>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-2">
                    {rights.add && role.status !== "closed" && role.status !== "filled" ? (
                      <button
                        type="button"
                        onClick={() =>
                          setAddingCandidate((v) => (v === role.id ? null : role.id))
                        }
                        className="rounded-lg border border-line px-3 py-1.5 font-body text-sm font-bold text-white hover:bg-hover"
                      >
                        {addingCandidate === role.id ? "Cancel" : "Add candidate"}
                      </button>
                    ) : null}
                    {rights.decide ? (
                      <select
                        aria-label={`Status of ${role.title}`}
                        value={role.status}
                        disabled={busy}
                        onChange={(e) =>
                          void send(
                            `/api/hiring/roles/${role.id}`,
                            "PATCH",
                            { status: e.target.value },
                            `"${role.title}" is now ${e.target.value.replace("_", " ")}.`,
                          )
                        }
                        className="rounded-lg border border-line bg-card px-2 py-1 font-body text-xs text-white"
                      >
                        <option value="open">open</option>
                        <option value="on_hold">on hold</option>
                        <option value="filled">filled</option>
                        <option value="closed">closed</option>
                      </select>
                    ) : null}
                  </div>
                </div>

                {addingCandidate === role.id ? (
                  <CandidateForm
                    busy={busy}
                    onSubmit={async (input) => {
                      const ok = await send(
                        "/api/hiring/candidates",
                        "POST",
                        { ...input, roleId: role.id },
                        `${input.fullName} is on the board.`,
                      );
                      if (ok) setAddingCandidate(null);
                    }}
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
          <h2 className="font-heading text-2xl text-white">People moving</h2>
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

        {shown.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line-strong bg-card px-6 py-8 text-center font-body text-sm font-light text-muted">
            Nobody is moving through this seat yet.
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
                      <span className="rounded-full bg-white/5 px-2 py-0.5 font-body text-[10px] font-bold uppercase tracking-wide text-muted">
                        {candidate.stageLabel}
                      </span>
                      {candidate.feedbackOutstanding > 0 ? (
                        <span className="rounded-full bg-amber/10 px-2 py-0.5 font-body text-[10px] font-bold uppercase tracking-wide text-amber-deep">
                          {candidate.feedbackOutstanding} owed
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 font-body text-xs font-light text-muted">
                      {candidate.roleTitle}
                      {candidate.source ? ` · ${candidate.source}` : ""}
                      {candidate.noticeDays != null ? ` · ${candidate.noticeDays} days' notice` : ""}
                      {candidate.expectedCtc != null
                        ? ` · asking ${formatINR(candidate.expectedCtc)}`
                        : ""}
                    </p>
                    <p className="mt-1 font-body text-xs font-light text-muted">
                      {candidate.nextRoundAt
                        ? `Next round ${when(candidate.nextRoundAt)}`
                        : "Nothing scheduled"}
                    </p>
                  </div>

                  <div className="shrink-0">
                    <Link
                      href={`/hr/candidates/${candidate.id}`}
                      className="rounded-lg border border-line px-3 py-1.5 font-body text-sm font-bold text-white hover:bg-hover"
                    >
                      Open
                    </Link>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── the diary ───────────────────────────────────────────────── */}
      <section>
        <h2 className="mb-3 font-heading text-2xl text-white">Coming up</h2>
        <RoundsList rounds={upcoming} emptyMessage="No rounds scheduled." />
      </section>

      <p className="font-body text-xs font-light text-muted">
        Stages: {stages.map((s) => s.label).join(" → ")}. They are rows in the
        database, not code — changing the order is an update, not a deploy.
      </p>
    </div>
  );
}

function RoleStatusPill({ status }: { status: OpenRole["status"] }) {
  const tone =
    status === "open"
      ? "bg-success/10 text-success"
      : status === "on_hold"
        ? "bg-amber/10 text-amber-deep"
        : "bg-white/5 text-muted";
  return (
    <span
      className={`rounded-full px-2 py-0.5 font-body text-[10px] font-bold uppercase tracking-wide ${tone}`}
    >
      {status.replace("_", " ")}
    </span>
  );
}

function RoleForm({
  departments,
  busy,
  onSubmit,
}: {
  departments: { id: string; name: string }[];
  busy: boolean;
  onSubmit: (input: {
    title: string;
    departmentId: string | null;
    headcount: number;
    location: string | null;
    notes: string | null;
  }) => void;
}) {
  const [title, setTitle] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [headcount, setHeadcount] = useState(1);
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");

  return (
    <form
      className="mb-4 rounded-lg border border-line bg-card p-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          title,
          departmentId: departmentId || null,
          headcount,
          location: location || null,
          notes: notes || null,
        });
      }}
    >
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Title">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={inputClass}
            placeholder="Junior Draughtsman"
          />
        </Field>
        <Field label="Department">
          <select
            value={departmentId}
            onChange={(e) => setDepartmentId(e.target.value)}
            className={inputClass}
          >
            <option value="">Not said</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="How many">
          <input
            type="number"
            min={1}
            value={headcount}
            onChange={(e) => setHeadcount(Number(e.target.value))}
            className={inputClass}
          />
        </Field>
        <Field label="Where">
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className={inputClass}
            placeholder="Gurugram"
          />
        </Field>
      </div>
      <Field label="Why this seat exists">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className={inputClass}
          placeholder="What breaks today because nobody is doing this."
        />
      </Field>
      <button type="submit" disabled={busy} className={primaryClass}>
        Open the seat
      </button>
    </form>
  );
}

function CandidateForm({
  busy,
  onSubmit,
}: {
  busy: boolean;
  onSubmit: (input: {
    fullName: string;
    email: string | null;
    phone: string | null;
    source: string | null;
    expectedCtc: number | null;
    noticeDays: number | null;
    resumeUrl: string | null;
  }) => void;
}) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [source, setSource] = useState("");
  const [expectedCtc, setExpectedCtc] = useState("");
  const [noticeDays, setNoticeDays] = useState("");
  const [resumeUrl, setResumeUrl] = useState("");

  return (
    <form
      className="mt-4 border-t border-line pt-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          fullName,
          email: email || null,
          phone: phone || null,
          source: source || null,
          expectedCtc: expectedCtc ? Number(expectedCtc) : null,
          noticeDays: noticeDays ? Number(noticeDays) : null,
          resumeUrl: resumeUrl || null,
        });
      }}
    >
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Name">
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Email">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Phone">
          <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Where they came from">
          <input
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className={inputClass}
            placeholder="referral · naukri · walk-in"
          />
        </Field>
        <Field label="Asking (₹ a year)">
          <input
            type="number"
            min={0}
            value={expectedCtc}
            onChange={(e) => setExpectedCtc(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Notice (days)">
          <input
            type="number"
            min={0}
            value={noticeDays}
            onChange={(e) => setNoticeDays(e.target.value)}
            className={inputClass}
          />
        </Field>
      </div>
      <Field label="CV (link)">
        <input
          value={resumeUrl}
          onChange={(e) => setResumeUrl(e.target.value)}
          className={inputClass}
          placeholder="https://…"
        />
      </Field>
      <button type="submit" disabled={busy} className={primaryClass}>
        Add to the board
      </button>
    </form>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="mt-3 block first:mt-0">
      <span className="mb-1 block font-body text-[11px] font-bold uppercase tracking-[0.16em] text-muted">
        {label}
      </span>
      {children}
    </label>
  );
}

export const inputClass =
  "w-full rounded-lg border border-line bg-card px-3 py-2 font-body text-sm text-white placeholder:text-muted";

export const primaryClass =
  "mt-4 rounded-lg bg-forest px-4 py-2 font-body text-sm font-bold text-cream hover:bg-forest/90 disabled:opacity-40";
