"use client";

import { useState } from "react";
import Link from "next/link";
import type { Contactable } from "@/lib/services/candidate-contact";

/**
 * Reaching the candidates — one screen, everybody on it.
 *
 * The candidate file can already send one person their link. This is the
 * other half of the job: HR's Monday morning, where the question is not "send
 * this person a link" but "who has not been written to, and who never
 * opened it".
 *
 * SO THE TWO COLUMNS THAT MATTER ARE THE LAST TWO. Sorting by stage is how
 * the board already thinks; sorting by whether somebody has been reached is
 * how this screen thinks. A candidate with no live link has never been sent
 * one. A candidate who has one and has never opened it is the one to chase —
 * and chasing somebody who replied last week is the thing this exists to
 * stop.
 *
 * WHATSAPP IS ONE AT A TIME AND EMAIL IS NOT. That is not an omission. The
 * WhatsApp button opens WhatsApp with the message already written and HR
 * presses send — a browser blocks the second window, and twenty of them would
 * be HR pressing send twenty times anyway. Email is sent by the server, so it
 * can go to twenty people at once.
 *
 * WHAT THE BUTTON DOES IS SAID ON THE BUTTON. "Open WhatsApp" opens WhatsApp.
 * "Email link" sends an email. Neither is called "send", because one of them
 * does not send anything.
 */

type Banner = { tone: "error" | "success"; message: string };

export function ContactBoard({ candidates }: { candidates: Contactable[] }) {
  const [rows, setRows] = useState(candidates);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [banner, setBanner] = useState<Banner | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const emailable = rows.filter((r) => r.email);
  const notReached = rows.filter((r) => !r.hasLiveLink);
  const notOpened = rows.filter((r) => r.hasLiveLink && !r.opened);

  function toggle(id: string) {
    const next = new Set(picked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked(next);
  }

  function markSent(ids: string[]) {
    setRows(
      rows.map((r) =>
        ids.includes(r.candidateId) ? { ...r, hasLiveLink: true, opened: false } : r,
      ),
    );
  }

  async function whatsapp(row: Contactable) {
    setBusy(row.candidateId);
    setBanner(null);
    try {
      const res = await fetch(`/api/hiring/candidates/${row.candidateId}/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: "whatsapp" }),
      });
      const data = (await res.json()) as {
        error?: string;
        prepared?: { openUrl?: string };
      };
      if (!res.ok || !data.prepared?.openUrl) {
        setBanner({ tone: "error", message: data.error ?? "That did not work." });
        return;
      }
      markSent([row.candidateId]);
      /* A new tab rather than this one. HR is working through a list and
         should come back to it, not have to navigate back. */
      window.open(data.prepared.openUrl, "_blank", "noopener,noreferrer");
      setBanner({
        tone: "success",
        message: `WhatsApp opened for ${row.name}. Press send there — the portal cannot do that part.`,
      });
    } catch {
      setBanner({ tone: "error", message: "The connection dropped." });
    } finally {
      setBusy(null);
    }
  }

  async function email(row: Contactable) {
    setBusy(row.candidateId);
    setBanner(null);
    try {
      const res = await fetch(`/api/hiring/candidates/${row.candidateId}/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: "email" }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setBanner({ tone: "error", message: data.error ?? "That did not work." });
        return;
      }
      markSent([row.candidateId]);
      setBanner({ tone: "success", message: `Sent to ${row.name}.` });
    } catch {
      setBanner({ tone: "error", message: "The connection dropped." });
    } finally {
      setBusy(null);
    }
  }

  async function emailPicked() {
    setBusy("bulk");
    setBanner(null);
    try {
      const ids = [...picked];
      const res = await fetch("/api/hiring/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateIds: ids }),
      });
      const data = (await res.json()) as {
        error?: string;
        outcomes?: { candidateId: string; name: string; ok: boolean; error?: string }[];
      };
      if (!res.ok || !data.outcomes) {
        setBanner({ tone: "error", message: data.error ?? "That did not work." });
        return;
      }

      const sent = data.outcomes.filter((o) => o.ok);
      const failed = data.outcomes.filter((o) => !o.ok);
      markSent(sent.map((o) => o.candidateId));
      setPicked(new Set());

      /* Failures are named, not counted. "3 failed" sends HR hunting through
         twenty files to find which three. */
      setBanner(
        failed.length === 0
          ? { tone: "success", message: `Sent to ${sent.length}.` }
          : {
              tone: "error",
              message:
                `Sent to ${sent.length}. Did not go to: ` +
                failed.map((f) => `${f.name} — ${f.error ?? "failed"}`).join("; "),
            },
      );
    } catch {
      setBanner({ tone: "error", message: "The connection dropped." });
    } finally {
      setBusy(null);
    }
  }

  if (rows.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-line-strong bg-card px-6 py-10 text-center font-body text-sm font-light text-muted">
        Nobody is moving through hiring at the moment. Add a candidate against
        an open seat and they will appear here.
      </p>
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <p className="font-body text-sm font-light text-muted">
          {notReached.length > 0 ? (
            <span className="text-warning">
              {notReached.length} never sent a link
            </span>
          ) : (
            <span className="text-success">Everybody has a link</span>
          )}
          <span className="text-muted"> · </span>
          {notOpened.length} sent but never opened
        </p>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() =>
              setPicked(new Set(notReached.filter((r) => r.email).map((r) => r.candidateId)))
            }
            disabled={notReached.filter((r) => r.email).length === 0}
            className="rounded-lg border border-line px-3 py-1.5 font-body text-xs font-bold text-secondary hover:bg-hover disabled:opacity-40"
          >
            Select everyone not yet sent
          </button>
          <button
            type="button"
            disabled={picked.size === 0 || busy !== null}
            onClick={emailPicked}
            className="rounded-lg bg-white px-4 py-1.5 font-body text-sm font-bold text-espresso hover:bg-white/90 disabled:opacity-40"
          >
            {busy === "bulk"
              ? "Sending…"
              : `Email link to ${picked.size || ""} ${picked.size === 1 ? "person" : "people"}`.trim()}
          </button>
        </div>
      </div>

      {banner ? (
        <div
          role="status"
          className={`mb-4 rounded-lg border px-4 py-3 font-body text-sm ${
            banner.tone === "error"
              ? "border-error/40 bg-error/10 text-error"
              : "border-success/40 bg-success/10 text-success"
          }`}
        >
          {banner.message}
        </div>
      ) : null}

      <ul className="space-y-2">
        {rows.map((row) => (
          <li
            key={row.candidateId}
            className="rounded-lg border border-line bg-card px-4 py-3"
          >
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="checkbox"
                aria-label={`Select ${row.name}`}
                checked={picked.has(row.candidateId)}
                disabled={!row.email}
                onChange={() => toggle(row.candidateId)}
                className="h-4 w-4 accent-white disabled:opacity-30"
              />

              <div className="min-w-0 flex-1">
                <Link
                  href={`/hr/candidates/${row.candidateId}`}
                  className="font-body text-[15px] font-bold text-white underline-offset-4 hover:underline"
                >
                  {row.name}
                </Link>
                <p className="font-body text-xs font-light text-muted">
                  {row.roleTitle} · {row.stage}
                  {row.email ? ` · ${row.email}` : " · no email"}
                  {row.phone ? ` · ${row.phone}` : " · no phone"}
                </p>
              </div>

              <span
                className={`rounded-full px-2 py-0.5 font-body text-[10px] font-bold uppercase tracking-wide ${
                  !row.hasLiveLink
                    ? "bg-warning/10 text-warning"
                    : row.opened
                      ? "bg-success/10 text-success"
                      : "bg-white/5 text-muted"
                }`}
              >
                {!row.hasLiveLink ? "not sent" : row.opened ? "opened" : "not opened"}
              </span>

              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={!row.phone || busy !== null}
                  onClick={() => whatsapp(row)}
                  title={row.phone ? undefined : "No phone number on their record"}
                  className="rounded border border-line-strong px-3 py-1.5 font-body text-xs font-bold text-white hover:bg-hover disabled:opacity-30"
                >
                  {busy === row.candidateId ? "…" : "Open WhatsApp"}
                </button>
                <button
                  type="button"
                  disabled={!row.email || busy !== null}
                  onClick={() => email(row)}
                  title={row.email ? undefined : "No email address on their record"}
                  className="rounded border border-line px-3 py-1.5 font-body text-xs font-bold text-secondary hover:bg-hover disabled:opacity-30"
                >
                  Email link
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      <p className="mt-4 font-body text-xs font-light leading-relaxed text-muted">
        Sending makes a new link and stops the old one working, so the last
        thing sent is always the one that opens. WhatsApp opens on your machine
        with the message written — the portal does not send it, you do.
        {emailable.length < rows.length
          ? ` ${rows.length - emailable.length} of these have no email address on record.`
          : ""}
      </p>
    </div>
  );
}
