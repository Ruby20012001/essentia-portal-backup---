"use client";

import { useCallback, useState } from "react";
import type { ApprovalInboxItem } from "@/lib/services/workflow-inbox";

type Banner = { tone: "error" | "success"; message: string };
type Advisory = {
  slaRisk?: { level: string; hoursRemaining: number | null };
  ai?: { available: boolean; summary?: string; reason?: string };
  disclaimer?: string;
};

/**
 * My Approvals — the approver's inbox. Every pending decision across all
 * workflows (PIO, parallel, conditional, SLA), delegation-aware. Approve /
 * reject inline; peek an advisory (SLA risk + AI summary). Refusals surface
 * verbatim; the system never blocks silently.
 */
export function ApprovalsInbox({ initial }: { initial: ApprovalInboxItem[] }) {
  const [items, setItems] = useState(initial);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [advisories, setAdvisories] = useState<Record<string, Advisory | "loading">>({});

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
            return (
              <li
                key={item.taskId}
                className="rounded-xl border border-espresso/10 bg-white/70 p-5 shadow-sm"
              >
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
                      {item.groupName} · {item.resourceRef}
                    </p>
                    <p className={`mt-1 font-body text-xs ${sla.tone}`}>{sla.text}</p>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      disabled={busyId === item.taskId}
                      onClick={() => loadAdvisory(item)}
                      className="rounded-lg border border-espresso/15 px-3 py-2 font-body text-sm font-bold text-espresso hover:bg-espresso/5 disabled:opacity-40"
                    >
                      Advisory
                    </button>
                    <button
                      type="button"
                      disabled={busyId === item.taskId}
                      onClick={() => act(item, "reject")}
                      className="rounded-lg border border-alert/40 px-4 py-2 font-body text-sm font-bold text-alert hover:bg-alert/5 disabled:opacity-40"
                    >
                      Reject
                    </button>
                    <button
                      type="button"
                      disabled={busyId === item.taskId}
                      onClick={() => act(item, "approve")}
                      className="rounded-lg bg-forest px-4 py-2 font-body text-sm font-bold text-cream hover:bg-forest/90 disabled:opacity-40"
                    >
                      Approve
                    </button>
                  </div>
                </div>

                {advisory ? (
                  <div className="mt-4 rounded-lg border border-espresso/10 bg-cream/70 p-4">
                    {advisory === "loading" ? (
                      <p className="font-body text-sm font-light text-label">Loading advisory…</p>
                    ) : (
                      <div className="space-y-1.5 font-body text-sm">
                        {advisory.slaRisk ? (
                          <p className="text-label">
                            <span className="font-bold text-espresso">SLA risk:</span>{" "}
                            {advisory.slaRisk.level}
                            {advisory.slaRisk.hoursRemaining != null
                              ? ` · ${advisory.slaRisk.hoursRemaining}h remaining`
                              : ""}
                          </p>
                        ) : null}
                        <p className="text-label">
                          <span className="font-bold text-espresso">AI summary:</span>{" "}
                          {advisory.ai?.available
                            ? advisory.ai.summary
                            : `unavailable — ${advisory.ai?.reason ?? "not configured"}`}
                        </p>
                        {advisory.disclaimer ? (
                          <p className="pt-1 text-xs font-light italic text-label">{advisory.disclaimer}</p>
                        ) : null}
                      </div>
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

function slaLabel(slaDueAt: string | null): { text: string; tone: string } {
  if (!slaDueAt) return { text: "No SLA", tone: "text-label" };
  const hrs = (new Date(slaDueAt).getTime() - Date.now()) / 3_600_000;
  if (hrs <= 0) return { text: "SLA breached", tone: "font-bold text-alert" };
  const rounded = Math.round(hrs);
  if (hrs < 12) return { text: `Due in ${rounded}h`, tone: "text-alert" };
  if (hrs < 24) return { text: `Due in ${rounded}h`, tone: "text-amber" };
  return { text: `Due in ${rounded}h`, tone: "text-forest" };
}
