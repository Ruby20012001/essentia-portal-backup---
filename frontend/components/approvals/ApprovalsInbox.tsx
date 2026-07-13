"use client";

import { useCallback, useState } from "react";
import type { ApprovalInboxItem } from "@/lib/services/workflow-inbox";

type Banner = { tone: "error" | "success"; message: string };
type Advisory = {
  slaRisk?: { level: string; hoursRemaining: number | null };
  ai?: { available: boolean; summary?: string; reason?: string };
  disclaimer?: string;
};
type Detail = {
  status: string;
  groups: Array<{
    groupNo: number;
    name: string;
    quorum: number;
    state: "done" | "current" | "skipped" | "upcoming";
    approvers: Array<{ name: string; status: string | null; delegatedTo: string | null }>;
  }>;
  history: Array<{ action: string; actor: string | null; at: string; comments: string | null }>;
};
type Colleague = { id: string; name: string; email: string; jobTitle: string | null };

/**
 * My Approvals — the approver's inbox. Every pending decision across all
 * workflows (PIO, parallel, conditional, SLA), delegation-aware. Per item:
 * view the chain timeline, peek an AI advisory, delegate, or approve/reject.
 * Refusals surface verbatim; the system never blocks silently.
 */
export function ApprovalsInbox({ initial }: { initial: ApprovalInboxItem[] }) {
  const [items, setItems] = useState(initial);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [advisories, setAdvisories] = useState<Record<string, Advisory | "loading">>({});
  const [details, setDetails] = useState<Record<string, Detail | "loading">>({});
  const [delegateFor, setDelegateFor] = useState<string | null>(null);
  const [userQuery, setUserQuery] = useState("");
  const [userResults, setUserResults] = useState<Colleague[]>([]);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/workflows/inbox");
    if (res.ok) setItems((await res.json()).approvals);
  }, []);

  async function act(item: ApprovalInboxItem, action: "approve" | "reject") {
    setBusyId(item.taskId);
    setBanner(null);
    try {
      const res = await fetch(`/api/workflows/${item.instanceId}/act`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setBanner({ tone: "error", message: data.error ?? `Request failed (${res.status})` });
        return;
      }
      await refresh();
      setBanner({
        tone: "success",
        message: `${item.workflowName} — ${action === "approve" ? "approved" : "rejected"}${
          data.instance?.status === "approved" ? " (workflow complete)" : ""
        }.`,
      });
    } finally {
      setBusyId(null);
    }
  }

  async function loadAdvisory(item: ApprovalInboxItem) {
    setAdvisories((a) => ({ ...a, [item.taskId]: "loading" }));
    const res = await fetch(`/api/workflows/${item.instanceId}/advisory`);
    const data = await res.json().catch(() => ({}));
    setAdvisories((a) => ({ ...a, [item.taskId]: res.ok ? data : { ai: { available: false, reason: data.error } } }));
  }

  async function toggleChain(item: ApprovalInboxItem) {
    if (details[item.taskId]) {
      setDetails((d) => {
        const next = { ...d };
        delete next[item.taskId];
        return next;
      });
      return;
    }
    setDetails((d) => ({ ...d, [item.taskId]: "loading" }));
    const res = await fetch(`/api/workflows/${item.instanceId}`);
    const data = await res.json().catch(() => ({}));
    if (res.ok) setDetails((d) => ({ ...d, [item.taskId]: data.detail }));
  }

  async function searchUsers(q: string) {
    setUserQuery(q);
    if (q.trim().length < 2) return setUserResults([]);
    const res = await fetch(`/api/users?q=${encodeURIComponent(q)}`);
    if (res.ok) setUserResults((await res.json()).users);
  }

  async function delegate(item: ApprovalInboxItem, colleague: Colleague) {
    setBusyId(item.taskId);
    setBanner(null);
    try {
      const res = await fetch(`/api/workflows/${item.instanceId}/delegate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toUserId: colleague.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setBanner({ tone: "error", message: data.error ?? `Request failed (${res.status})` });
        return;
      }
      setDelegateFor(null);
      setUserQuery("");
      setUserResults([]);
      await refresh();
      setBanner({ tone: "success", message: `${item.workflowName} — delegated to ${colleague.name}.` });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      {banner ? (
        <div
          role="alert"
          className={`mb-6 rounded-lg border-l-4 px-5 py-3 font-body text-sm ${
            banner.tone === "error"
              ? "border-alert bg-alert/5 font-bold text-alert"
              : "border-forest bg-forest/5 font-light text-forest"
          }`}
        >
          {banner.message}
        </div>
      ) : null}

      {items.length === 0 ? (
        <div className="rounded-xl border border-espresso/10 bg-cream/60 px-6 py-16 text-center">
          <p className="font-heading text-2xl text-espresso">All clear</p>
          <p className="mt-1 font-body text-sm font-light text-label">
            You have no approvals waiting. New items appear here the moment they are assigned to you.
          </p>
        </div>
      ) : (
        <ul className="space-y-4">
          {items.map((item) => {
            const sla = slaLabel(item.slaDueAt);
            const advisory = advisories[item.taskId];
            const detail = details[item.taskId];
            const delegating = delegateFor === item.taskId;
            return (
              <li key={item.taskId} className="rounded-xl border border-espresso/10 bg-white/70 p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-heading text-xl text-espresso">{item.workflowName}</h3>
                      {item.delegated ? (
                        <span className="rounded-full bg-navy/10 px-2 py-0.5 font-body text-xs font-bold text-navy">
                          Delegated to you
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 font-body text-sm font-light text-label">
                      {item.groupName}
                      {item.resourceRef ? <span className="text-espresso"> · {item.resourceRef}</span> : null}
                    </p>
                    <p className={`mt-1 font-body text-xs ${sla.tone}`}>{sla.text}</p>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <button type="button" onClick={() => toggleChain(item)} className={ghost}>
                      {detail ? "Hide chain" : "View chain"}
                    </button>
                    <button type="button" onClick={() => loadAdvisory(item)} className={ghost}>
                      Advisory
                    </button>
                    <button
                      type="button"
                      onClick={() => { setDelegateFor(delegating ? null : item.taskId); setUserQuery(""); setUserResults([]); }}
                      className={ghost}
                    >
                      Delegate
                    </button>
                    <button type="button" disabled={busyId === item.taskId} onClick={() => act(item, "reject")}
                      className="rounded-lg border border-alert/40 px-4 py-2 font-body text-sm font-bold text-alert hover:bg-alert/5 disabled:opacity-40">
                      Reject
                    </button>
                    <button type="button" disabled={busyId === item.taskId} onClick={() => act(item, "approve")}
                      className="rounded-lg bg-forest px-4 py-2 font-body text-sm font-bold text-cream hover:bg-forest/90 disabled:opacity-40">
                      Approve
                    </button>
                  </div>
                </div>

                {delegating ? (
                  <div className="mt-4 rounded-lg border border-navy/20 bg-navy/5 p-4">
                    <label className="font-body text-sm font-bold text-espresso">Delegate this approval to…</label>
                    <input
                      autoFocus
                      value={userQuery}
                      onChange={(e) => searchUsers(e.target.value)}
                      placeholder="Search a colleague by name or email"
                      className="mt-2 w-full rounded-lg border border-espresso/15 px-3 py-2 font-body text-sm text-espresso"
                    />
                    {userResults.length ? (
                      <ul className="mt-2 divide-y divide-espresso/5">
                        {userResults.map((c) => (
                          <li key={c.id}>
                            <button type="button" disabled={busyId === item.taskId} onClick={() => delegate(item, c)}
                              className="flex w-full items-center justify-between px-1 py-2 text-left hover:bg-espresso/5 disabled:opacity-40">
                              <span className="font-body text-sm text-espresso">{c.name}</span>
                              <span className="font-body text-xs text-label">{c.jobTitle ?? c.email}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : userQuery.trim().length >= 2 ? (
                      <p className="mt-2 font-body text-xs text-label">No matching colleagues.</p>
                    ) : null}
                  </div>
                ) : null}

                {advisory ? (
                  <div className="mt-4 rounded-lg border border-espresso/10 bg-cream/70 p-4">
                    {advisory === "loading" ? (
                      <p className="font-body text-sm font-light text-label">Loading advisory…</p>
                    ) : (
                      <div className="space-y-1.5 font-body text-sm">
                        {advisory.slaRisk ? (
                          <p className="text-label">
                            <span className="font-bold text-espresso">SLA risk:</span> {advisory.slaRisk.level}
                            {advisory.slaRisk.hoursRemaining != null ? ` · ${advisory.slaRisk.hoursRemaining}h remaining` : ""}
                          </p>
                        ) : null}
                        <p className="text-label">
                          <span className="font-bold text-espresso">AI summary:</span>{" "}
                          {advisory.ai?.available ? advisory.ai.summary : `unavailable — ${advisory.ai?.reason ?? "not configured"}`}
                        </p>
                        {advisory.disclaimer ? (
                          <p className="pt-1 text-xs font-light italic text-label">{advisory.disclaimer}</p>
                        ) : null}
                      </div>
                    )}
                  </div>
                ) : null}

                {detail ? (
                  <div className="mt-4 rounded-lg border border-espresso/10 bg-cream/40 p-4">
                    {detail === "loading" ? (
                      <p className="font-body text-sm font-light text-label">Loading chain…</p>
                    ) : (
                      <ol className="space-y-2">
                        {detail.groups.map((g) => (
                          <li key={g.groupNo} className="flex items-start gap-3">
                            <span className={`mt-0.5 rounded-full px-2 py-0.5 font-body text-xs font-bold ${statePill(g.state)}`}>
                              {g.state}
                            </span>
                            <div className="min-w-0">
                              <p className="font-body text-sm font-bold text-espresso">
                                {g.name}
                                {g.quorum > 1 ? <span className="font-light text-label"> · quorum {g.quorum}</span> : null}
                              </p>
                              <p className="font-body text-xs text-label">
                                {g.approvers
                                  .map((a) => `${a.name}${a.status ? ` (${a.status})` : ""}${a.delegatedTo ? ` → ${a.delegatedTo}` : ""}`)
                                  .join(" · ")}
                              </p>
                            </div>
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

const ghost =
  "rounded-lg border border-espresso/15 px-3 py-2 font-body text-sm font-bold text-espresso hover:bg-espresso/5 disabled:opacity-40";

function statePill(state: string): string {
  if (state === "done") return "bg-forest/10 text-forest";
  if (state === "current") return "bg-amber/15 text-amber";
  if (state === "skipped") return "bg-espresso/5 text-label";
  return "bg-espresso/5 text-label";
}

function slaLabel(slaDueAt: string | null): { text: string; tone: string } {
  if (!slaDueAt) return { text: "No SLA", tone: "text-label" };
  const hrs = (new Date(slaDueAt).getTime() - Date.now()) / 3_600_000;
  if (hrs <= 0) return { text: "SLA breached", tone: "font-bold text-alert" };
  const rounded = Math.round(hrs);
  if (hrs < 12) return { text: `Due in ${rounded}h`, tone: "text-alert" };
  if (hrs < 24) return { text: `Due in ${rounded}h`, tone: "text-amber" };
  return { text: `Due in ${rounded}h`, tone: "text-forest" };
}
