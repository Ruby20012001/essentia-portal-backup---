"use client";

import { useState } from "react";
import type {
  CandidateDocument,
  InviteStatus,
} from "@/lib/services/candidate-portal";

/**
 * The candidate's page, from HR's side: make the link, see whether it was
 * opened, take it away again.
 *
 * THE TOKEN IS SHOWN ONCE AND THEN IT IS GONE. Only its hash is stored, so
 * there is no screen anywhere — including this one, on a later visit — that
 * can show it again. That is deliberate and it has a cost: HR must copy it
 * now. The panel says so plainly rather than letting somebody navigate away
 * and come back for it.
 *
 * WHY THERE IS NO SEND BUTTON. Mail is configured per deployment and is not
 * on everywhere, and a button that silently does nothing is worse than no
 * button. HR copies the link into whatever they were already writing to the
 * candidate in, which is also where the candidate will reply. When the
 * Communication Spine lands this becomes one click.
 */

const IST = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function when(iso: string | null): string {
  if (!iso) return "—";
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? iso : IST.format(at).replace(",", "");
}

type Banner = { tone: "error" | "success"; message: string };

export function InvitePanel({
  candidateId,
  candidateEmail,
  canInvite,
  initial,
  documents,
}: {
  candidateId: string;
  candidateEmail: string | null;
  canInvite: boolean;
  initial: InviteStatus | null;
  documents: CandidateDocument[];
}) {
  const [invite, setInvite] = useState<InviteStatus | null>(initial);
  const [freshLink, setFreshLink] = useState<string | null>(null);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function issue() {
    setBusy(true);
    setBanner(null);
    try {
      const res = await fetch(`/api/hiring/candidates/${candidateId}/invite`, {
        method: "POST",
      });
      const data = (await res.json()) as {
        error?: string;
        invite?: { url: string; expiresAt: string };
      };
      if (!res.ok || !data.invite) {
        setBanner({ tone: "error", message: data.error ?? "That did not work." });
        return;
      }
      setFreshLink(data.invite.url);
      setInvite({
        issuedAt: new Date().toISOString(),
        expiresAt: data.invite.expiresAt,
        sentTo: candidateEmail,
        lastSeenAt: null,
        seenCount: 0,
        expired: false,
      });
    } catch {
      setBanner({ tone: "error", message: "The connection dropped. Try again." });
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    setBusy(true);
    setBanner(null);
    try {
      const res = await fetch(`/api/hiring/candidates/${candidateId}/invite`, {
        method: "DELETE",
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setBanner({ tone: "error", message: data.error ?? "That did not work." });
        return;
      }
      setInvite(null);
      setFreshLink(null);
      setBanner({ tone: "success", message: "The link no longer opens." });
    } catch {
      setBanner({ tone: "error", message: "The connection dropped. Try again." });
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!freshLink) return;
    try {
      await navigator.clipboard.writeText(freshLink);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setBanner({
        tone: "error",
        message: "Could not reach the clipboard — select the link and copy it.",
      });
    }
  }

  return (
    <section className="mb-8 rounded-lg border border-line bg-card p-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-heading text-xl text-white">Their own page</h2>
          <p className="font-body text-sm font-light text-muted">
            A link they open without an account: the rounds that are booked,
            a way to confirm or ask to move one, and somewhere to put their CV.
          </p>
        </div>
        {canInvite ? (
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={issue}
              className="rounded-lg bg-white px-4 py-2 font-body text-sm font-bold text-espresso hover:bg-white/90 disabled:opacity-40"
            >
              {invite ? "Reissue link" : "Make link"}
            </button>
            {invite ? (
              <button
                type="button"
                disabled={busy}
                onClick={revoke}
                className="rounded-lg border border-line px-4 py-2 font-body text-sm font-bold text-secondary hover:bg-hover disabled:opacity-40"
              >
                Withdraw
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {banner ? (
        <div
          role="status"
          className={`mb-3 rounded-lg border px-4 py-2 font-body text-sm ${
            banner.tone === "error"
              ? "border-error/40 bg-error/10 text-error"
              : "border-success/40 bg-success/10 text-success"
          }`}
        >
          {banner.message}
        </div>
      ) : null}

      {freshLink ? (
        <div className="mb-3 rounded-lg border border-warning/40 bg-warning/10 p-4">
          <p className="mb-2 font-body text-sm font-bold text-warning">
            Copy this now — it cannot be shown again.
          </p>
          <p className="mb-3 font-body text-xs font-light text-secondary">
            Only a hash of it is stored, so nobody can look it up later. If it
            is lost, make a new one.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded-md bg-surface px-3 py-2 font-mono text-xs text-white">
              {freshLink}
            </code>
            <button
              type="button"
              onClick={copy}
              className="rounded-lg border border-line px-3 py-2 font-body text-xs font-bold text-white hover:bg-hover"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          {candidateEmail ? (
            <p className="mt-3 font-body text-xs font-light text-muted">
              Send it to {candidateEmail}.
            </p>
          ) : (
            <p className="mt-3 font-body text-xs font-light text-warning">
              There is no email address on this candidate. Add one, or you have
              nowhere to send this.
            </p>
          )}
        </div>
      ) : null}

      {invite ? (
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 font-body text-sm sm:grid-cols-4">
          <Fact label="Made" value={when(invite.issuedAt)} />
          <Fact
            label={invite.expired ? "Expired" : "Expires"}
            value={when(invite.expiresAt)}
            tone={invite.expired ? "warning" : undefined}
          />
          <Fact
            label="Last opened"
            value={invite.lastSeenAt ? when(invite.lastSeenAt) : "never"}
            tone={invite.lastSeenAt ? undefined : "muted"}
          />
          <Fact label="Times opened" value={String(invite.seenCount)} />
        </dl>
      ) : !freshLink ? (
        <p className="font-body text-sm font-light text-muted">
          No link at the moment.{" "}
          {canInvite
            ? "Make one and send it to them."
            : "HR and the founders can make one."}
        </p>
      ) : null}

      {documents.length > 0 ? (
        <div className="mt-5 border-t border-line pt-4">
          <h3 className="mb-2 font-body text-sm font-bold text-white">
            What they sent
          </h3>
          <ul className="space-y-2">
            {documents.map((doc) => (
              <li key={doc.id} className="flex flex-wrap items-center gap-2">
                <a
                  href={`/api/hiring/documents/${doc.id}`}
                  className="font-body text-sm text-white underline-offset-4 hover:underline"
                >
                  {doc.filename}
                </a>
                <span className="font-body text-xs font-light text-muted">
                  {Math.max(1, Math.round(doc.sizeBytes / 1024))} KB ·{" "}
                  {doc.uploadedBy === "candidate" ? "from them" : "added by HR"}{" "}
                  · {when(doc.uploadedAt)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function Fact({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "warning" | "muted";
}) {
  return (
    <div>
      <dt className="font-body text-[11px] font-bold uppercase tracking-wide text-muted">
        {label}
      </dt>
      <dd
        className={`font-body text-sm ${
          tone === "warning"
            ? "text-warning"
            : tone === "muted"
              ? "text-muted"
              : "text-white"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
