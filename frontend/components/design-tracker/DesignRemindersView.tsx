"use client";

import { useCallback, useEffect, useState } from "react";
import { inputClass, labelClass } from "@/components/design-tracker/HeatPill";
import { whenText } from "@/lib/services/design-reminders-logic";
import type { ReminderPreview, RunResult } from "@/lib/services/design-reminders";

type Notice = { tone: "error" | "success"; message: string } | null;

const KIND_LABEL: Record<string, string> = {
  designer: "Designer's morning list",
  head: "Escalation",
  leadership: "Second escalation",
};

const EMAIL_LABEL: Record<string, string> = {
  pending: "sending…",
  sent: "email sent",
  not_configured: "bell only — email is not switched on",
  failed: "email failed",
  no_address: "bell only — no email address",
};

/**
 * 🔔 Reminders — Vishakha's (and L0/L1's). Everything about the morning
 * reminders on one screen: whether they run, when a delay is escalated and to
 * whom, what tomorrow's run would send right now, and what went on the days
 * before. It reads and writes its own endpoint, so it loads only when opened.
 */
export function DesignRemindersView() {
  const [data, setData] = useState<ReminderPreview | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/design-tracker/reminders");
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotice({ tone: "error", message: body.error ?? `Could not load the reminders (${res.status}).` });
        return;
      }
      setData(body);
    } catch {
      setNotice({ tone: "error", message: "Could not reach the server. Reload the page and try again." });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const send = async (method: "PATCH" | "POST", path: string, body?: unknown, ok?: (r: unknown) => string) => {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(path, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) setNotice({ tone: "error", message: result.error ?? `Request failed (${res.status}).` });
      else if (ok) setNotice({ tone: "success", message: ok(result) });
    } catch {
      setNotice({ tone: "error", message: "Could not reach the server — nothing was changed. Reload and try again." });
    } finally {
      await load();
      setBusy(false);
    }
  };

  if (!data) {
    return (
      <div className="rounded-lg border border-line bg-card px-6 py-10 text-center font-body text-sm font-light text-muted">
        {notice ? <span className="font-bold text-alert">{notice.message}</span> : "Loading the reminders…"}
      </div>
    );
  }

  const s = data.settings;
  const pending = data.messages.filter((m) => !m.alreadySent);

  return (
    <div className="max-w-5xl">
      {notice ? (
        <div
          role="alert"
          className={`sticky top-0 z-20 mb-5 flex items-start gap-3 rounded-lg border-l-4 bg-card px-5 py-3 font-body text-sm shadow-sm ${
            notice.tone === "error" ? "border-alert font-bold text-alert" : "border-forest font-light text-forest"
          }`}
        >
          <span className="flex-1">{notice.message}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Close this message" className="text-lg leading-none text-muted hover:text-ink">
            ×
          </button>
        </div>
      ) : null}

      {/* On / off, and how it works — in one sentence people can check. */}
      <section className="mb-6 rounded-lg border border-line bg-card px-5 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="font-heading text-2xl text-white">Morning reminders</h2>
            <p className="mt-1 font-body text-sm font-light text-secondary">
              {s.remindersOn ? (
                <>
                  Every morning at <span className="font-bold text-ink">9:00</span>
                  {s.skipSunday ? " (not on Sundays)" : ""}: each designer gets their late and due activities. Anything
                  late <span className="font-bold text-ink">{s.escalateAfter}+ days</span> goes to Vishakha; late{" "}
                  <span className="font-bold text-ink">{s.escalateAgainAfter}+ days</span> also goes to{" "}
                  <span className="font-bold text-ink">{s.escalateAgainTo?.name ?? "nobody yet"}</span>.
                </>
              ) : (
                <span className="font-bold text-warning">Reminders are off — nothing is sent.</span>
              )}
            </p>
            <p className="mt-1 font-body text-xs font-light text-muted">
              Each reminder goes to the portal&rsquo;s bell 🔔
              {data.mailOn ? " and by email." : ". Email is not switched on for this deployment, so for now the bell only."}
            </p>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => void send("PATCH", "/api/design-tracker/reminders", { remindersOn: !s.remindersOn }, () =>
              s.remindersOn ? "Reminders switched off." : "Reminders switched on.",
            )}
            className={`rounded px-4 py-2 font-body text-sm font-bold transition-colors disabled:opacity-50 ${
              s.remindersOn
                ? "border border-line-strong bg-canvas text-secondary hover:bg-hover"
                : "bg-forest text-white hover:bg-forest/90"
            }`}
          >
            {s.remindersOn ? "Switch off" : "Switch on"}
          </button>
        </div>

        <div className="mt-4 grid gap-4 border-t border-line pt-4 md:grid-cols-4">
          <NumberField
            label="Escalate to Vishakha after"
            suffix="days late"
            value={s.escalateAfter}
            disabled={busy}
            onCommit={(v) => void send("PATCH", "/api/design-tracker/reminders", { escalateAfter: v }, () => `Escalation to Vishakha now after ${v} days.`)}
          />
          <NumberField
            label="Escalate again after"
            suffix="days late"
            value={s.escalateAgainAfter}
            disabled={busy}
            onCommit={(v) => void send("PATCH", "/api/design-tracker/reminders", { escalateAgainAfter: v }, () => `Second escalation now after ${v} days.`)}
          />
          <label className="block">
            <span className={labelClass}>Second escalation to</span>
            <select
              value={s.escalateAgainTo?.userId ?? ""}
              disabled={busy}
              onChange={(e) =>
                void send("PATCH", "/api/design-tracker/reminders", { escalateAgainTo: e.target.value || null }, () =>
                  e.target.value ? "Second escalation recipient changed." : "Second escalation switched off.",
                )
              }
              className={inputClass}
            >
              <option value="">Nobody</option>
              {data.leaders.map((l) => (
                <option key={l.userId} value={l.userId}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 self-end pb-2 font-body text-sm font-light text-secondary">
            <input
              type="checkbox"
              checked={s.skipSunday}
              disabled={busy}
              onChange={(e) =>
                void send("PATCH", "/api/design-tracker/reminders", { skipSunday: e.target.checked }, () =>
                  e.target.checked ? "No reminders on Sundays." : "Reminders on Sundays too.",
                )
              }
              className="h-4 w-4 accent-amber-deep"
            />
            Skip Sundays
          </label>
        </div>
      </section>

      {/* What would go, right now. */}
      <section className="mb-6">
        <div className="mb-2 flex flex-wrap items-end gap-3">
          <div className="flex-1">
            <h2 className="font-heading text-2xl text-white">What goes out</h2>
            <p className="font-body text-sm font-light text-muted">
              If the reminders ran now, against {data.today}. Nobody with nothing late or due gets a message.
            </p>
          </div>
          <button
            type="button"
            disabled={busy || !s.remindersOn || pending.length === 0}
            onClick={() => {
              if (!window.confirm(`Send today's reminders now to ${pending.length} ${pending.length === 1 ? "person" : "people"}? Each person gets them once a day.`)) return;
              void send("POST", "/api/design-tracker/reminders", undefined, (r) => {
                const run = r as RunResult;
                if (!run.ran) return run.reason ?? "Nothing was sent.";
                return run.sent.length === 0
                  ? "Nothing new to send — everyone on the list already had today's."
                  : `Sent to ${run.sent.map((x) => x.to).join(", ")}.`;
              });
            }}
            className="rounded bg-forest px-4 py-2 font-body text-sm font-bold text-white transition-colors hover:bg-forest/90 disabled:opacity-50"
          >
            Send today&rsquo;s now
          </button>
        </div>

        {data.messages.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line-strong bg-card px-6 py-8 text-center font-body text-sm font-light text-muted">
            Nothing late and nothing due today or tomorrow — no reminder would go.
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-line">
            {data.messages.map((m, i) => (
              <div key={`${m.kind}:${m.recipientUserId}`} className="border-t border-line bg-card first:border-t-0">
                <button
                  type="button"
                  onClick={() => setOpen(open === i ? null : i)}
                  className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-left transition-colors hover:bg-hover"
                >
                  <span
                    className={`rounded-full px-2 py-0.5 font-body text-[11px] font-bold ${
                      m.kind === "designer" ? "bg-surface text-secondary" : "bg-alert/10 text-alert"
                    }`}
                  >
                    {KIND_LABEL[m.kind]}
                  </span>
                  <span className="font-body text-sm font-bold text-ink">{m.recipientName}</span>
                  <span className="font-body text-sm font-light text-secondary">{m.title}</span>
                  <span className="ml-auto font-body text-xs font-light text-muted">
                    {m.alreadySent ? "✓ sent today" : m.emailTo ? `🔔 + ${m.emailTo}` : "🔔 only"}
                    {open === i ? " ▴" : " ▾"}
                  </span>
                </button>
                {open === i ? (
                  <ul className="border-t border-line bg-surface px-4 py-2">
                    {m.items.map((it, k) => (
                      <li key={k} className="flex items-center gap-2 py-1 font-body text-[13px]">
                        <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${it.daysLate > 0 ? "bg-alert" : "bg-warning"}`} />
                        <span className="text-ink">
                          {m.kind === "designer" ? "" : `${it.designer} · `}
                          {it.projectName} — {it.task}
                        </span>
                        <span className="font-light text-muted">
                          {whenText(it)} · {it.dependsOn}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Where each person's email goes. */}
      <section className="mb-6">
        <h2 className="mb-1 font-heading text-2xl text-white">Where each reminder goes</h2>
        <p className="mb-2 font-body text-sm font-light text-muted">
          The bell always. Email to the address below — leave it blank to use the sign-in account&rsquo;s address.
        </p>
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full text-left font-body text-[13.5px]">
            <thead>
              <tr className="bg-surface text-[11px] uppercase tracking-[0.12em] text-secondary">
                <th className="px-4 py-2.5 font-bold">Person</th>
                <th className="px-4 py-2.5 font-bold">Sign-in account</th>
                <th className="px-4 py-2.5 font-bold">Send reminders to</th>
              </tr>
            </thead>
            <tbody>
              {data.people.map((p) => (
                <tr key={p.id} className="border-t border-line bg-card">
                  <td className="px-4 py-2.5 font-bold text-ink">
                    {p.name}
                    <span className="ml-2 font-light text-muted">{p.role === "head" ? "head" : "designer"}</span>
                  </td>
                  <td className="px-4 py-2.5 font-light text-muted">{p.accountEmail ?? "no account — no reminders"}</td>
                  <td className="px-4 py-2.5">
                    <EmailField
                      key={`${p.id}:${p.notifyEmail ?? ""}`}
                      value={p.notifyEmail ?? ""}
                      placeholder={p.accountEmail ?? ""}
                      disabled={busy}
                      onCommit={(v) =>
                        void send("PATCH", `/api/design-tracker/people/${p.id}`, { notifyEmail: v || null }, () =>
                          v ? `${p.name}'s reminders go to ${v}.` : `${p.name}'s reminders go to their account's address.`,
                        )
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* What went. */}
      <section>
        <h2 className="mb-1 font-heading text-2xl text-white">Sent</h2>
        {data.log.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line-strong bg-card px-6 py-6 text-center font-body text-sm font-light text-muted">
            Nothing sent yet.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full text-left font-body text-[13px]">
              <thead>
                <tr className="bg-surface text-[11px] uppercase tracking-[0.12em] text-secondary">
                  <th className="px-4 py-2 font-bold">Day</th>
                  <th className="px-4 py-2 font-bold">To</th>
                  <th className="px-4 py-2 font-bold">What</th>
                  <th className="px-4 py-2 text-right font-bold">Items</th>
                  <th className="px-4 py-2 font-bold">Email</th>
                  <th className="px-4 py-2 font-bold">How</th>
                </tr>
              </thead>
              <tbody>
                {data.log.map((l, i) => (
                  <tr key={i} className="border-t border-line bg-card align-top">
                    <td className="whitespace-nowrap px-4 py-2 font-light text-secondary">{l.sentFor}</td>
                    <td className="px-4 py-2 text-ink">{l.recipientName}</td>
                    <td className="px-4 py-2 font-light text-secondary">{KIND_LABEL[l.kind]}</td>
                    <td className="px-4 py-2 text-right font-light text-secondary">{l.items}</td>
                    <td className={`px-4 py-2 font-light ${l.emailStatus === "failed" ? "text-alert" : "text-muted"}`} title={l.emailDetail ?? undefined}>
                      {EMAIL_LABEL[l.emailStatus]}
                      {l.emailTo && l.emailStatus === "sent" ? ` · ${l.emailTo}` : ""}
                    </td>
                    <td className="px-4 py-2 font-light text-muted">{l.triggeredBy === "cron" ? "9:00 run" : "sent by hand"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function NumberField({
  label,
  suffix,
  value,
  disabled,
  onCommit,
}: {
  label: string;
  suffix: string;
  value: number;
  disabled: boolean;
  onCommit: (v: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return (
    <label className="block">
      <span className={labelClass}>{label}</span>
      <span className="flex items-baseline gap-2">
        <input
          type="number"
          min={1}
          value={draft}
          disabled={disabled}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            const n = Number(draft);
            if (Number.isInteger(n) && n >= 1 && n !== value) onCommit(n);
            else setDraft(String(value));
          }}
          className={`${inputClass} w-20`}
        />
        <span className="font-body text-xs font-light text-muted">{suffix}</span>
      </span>
    </label>
  );
}

function EmailField({
  value,
  placeholder,
  disabled,
  onCommit,
}: {
  value: string;
  placeholder: string;
  disabled: boolean;
  onCommit: (v: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  return (
    <input
      type="email"
      value={draft}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft.trim() !== value) onCommit(draft.trim());
      }}
      className={`${inputClass} min-w-[16rem]`}
    />
  );
}
