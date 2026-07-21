"use client";

import { useCallback, useState } from "react";
import type { TimelineApprover, TimelineGroup, WorkflowDetail } from "@/lib/services/workflow-detail";
import type { WorkflowAuditEntry, WorkflowAuditKind } from "@/lib/services/workflow-audit";

type Tab = "timeline" | "advisory" | "audit";

type Advisory = {
  slaRisk?: { level: string; hoursRemaining: number | null };
  ai?: { available: boolean; summary?: string; reason?: string; provider?: string; model?: string };
  disclaimer?: string;
};

/**
 * Workflow Detail — the operating screen for one instance. Header, a vertical
 * approval timeline (with parallel cards, quorum, conditional skips, delegation
 * chains and SLA badges), the read-only AI advisory, and the cross-event audit.
 * Reuses the portal design system throughout; adds no new visual language.
 */
export function WorkflowDetailView({
  detail,
  audit,
  showAudit,
}: {
  detail: WorkflowDetail;
  audit: WorkflowAuditEntry[];
  showAudit: boolean;
}) {
  const [tab, setTab] = useState<Tab>("timeline");
  const [advisory, setAdvisory] = useState<Advisory | "loading" | null>(null);

  const loadAdvisory = useCallback(async () => {
    setTab("advisory");
    if (advisory) return;
    setAdvisory("loading");
    const res = await fetch(`/api/workflows/${detail.instanceId}/advisory`);
    const data = await res.json().catch(() => ({}));
    setAdvisory(res.ok ? data : { ai: { available: false, reason: data.error ?? "Advisory unavailable" } });
  }, [advisory, detail.instanceId]);

  return (
    <div>
      <Header detail={detail} />

      <div className="mb-6 flex flex-wrap gap-2 border-b border-line">
        <TabButton active={tab === "timeline"} onClick={() => setTab("timeline")}>
          Timeline
        </TabButton>
        <TabButton active={tab === "advisory"} onClick={loadAdvisory}>
          AI Advisory
        </TabButton>
        {showAudit ? (
          <TabButton active={tab === "audit"} onClick={() => setTab("audit")}>
            Audit
          </TabButton>
        ) : null}
      </div>

      {tab === "timeline" ? <Timeline groups={detail.groups} /> : null}
      {tab === "advisory" ? <AdvisoryPanel advisory={advisory} /> : null}
      {tab === "audit" && showAudit ? <AuditTab entries={audit} /> : null}
    </div>
  );
}

/* ── Header ─────────────────────────────────────────────────────────────── */
function Header({ detail }: { detail: WorkflowDetail }) {
  return (
    <div className="mb-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="mb-1 break-words font-heading text-4xl text-white">{detail.workflowName}</h1>
          {detail.description ? (
            <p className="font-body text-sm font-light text-muted">{detail.description}</p>
          ) : null}
        </div>
        <StatusPill status={detail.status} />
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
        <Field label="Document" value={detail.resourceRef ?? "—"} />
        <Field label="Module" value={detail.resourceType} />
        <Field label="Started by" value={detail.startedBy ?? "System"} />
        <Field label="Started" value={detail.startedAt ? detail.startedAt.slice(0, 10) : "—"} />
      </dl>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="font-body text-[11px] font-light uppercase tracking-[0.16em] text-muted">{label}</dt>
      <dd className="mt-0.5 break-words font-body text-sm text-white">{value}</dd>
    </div>
  );
}

/* ── Timeline ───────────────────────────────────────────────────────────── */
function Timeline({ groups }: { groups: TimelineGroup[] }) {
  return (
    <ol className="space-y-0">
      {groups.map((g, i) => (
        <li key={g.groupNo} className="flex gap-4">
          {/* Rail: marker + connector */}
          <div className="flex flex-col items-center">
            <StateMarker state={g.state} />
            {i < groups.length - 1 ? <span className="w-px flex-1 bg-line" /> : null}
          </div>

          <div className="min-w-0 flex-1 pb-8">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-body text-[15px] font-bold text-white">
                Step {g.groupNo} · {g.name}
              </h3>
              <StatePill state={g.state} />
              {g.quorum > 1 ? <QuorumIndicator group={g} /> : null}
            </div>

            {/* Conditional gate / skip reason */}
            {g.conditionText ? (
              <p className="mt-1 font-body text-xs font-light text-muted">
                {g.state === "skipped"
                  ? `Skipped — condition not met: ${g.conditionText}`
                  : `Runs when ${g.conditionText}`}
              </p>
            ) : null}

            {/* SLA config badges */}
            {g.slaHours || g.timeoutAction ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {g.slaHours ? <MiniBadge className="bg-white/5 text-secondary">SLA {g.slaHours}h</MiniBadge> : null}
                {g.timeoutAction ? (
                  <MiniBadge className="bg-white/5 text-muted">on timeout: {g.timeoutAction.replace(/_/g, " ")}</MiniBadge>
                ) : null}
              </div>
            ) : null}

            {/* Approvers — parallel cards when several, a row otherwise */}
            {g.state === "skipped" ? null : g.quorum > 1 || g.approvers.length > 1 ? (
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {g.approvers.map((a, idx) => (
                  <ApproverCard key={idx} approver={a} />
                ))}
              </div>
            ) : (
              <div className="mt-3">
                {g.approvers.map((a, idx) => (
                  <ApproverRow key={idx} approver={a} />
                ))}
              </div>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

function QuorumIndicator({ group }: { group: TimelineGroup }) {
  const approved = group.approvers.filter((a) => a.status === "approved").length;
  const reached = approved >= group.quorum;
  return (
    <span className="flex items-center gap-1.5">
      <MiniBadge className="bg-white/5 text-secondary">
        {approved} / {group.quorum} approved
      </MiniBadge>
      {reached ? <MiniBadge className="bg-success/10 text-success">Quorum reached</MiniBadge> : null}
    </span>
  );
}

function ApproverCard({ approver }: { approver: TimelineApprover }) {
  return (
    <div className="rounded-lg border border-line bg-card p-3">
      <ApproverIdentity approver={approver} />
    </div>
  );
}

function ApproverRow({ approver }: { approver: TimelineApprover }) {
  return (
    <div className="rounded-lg border border-line bg-card p-3">
      <ApproverIdentity approver={approver} />
    </div>
  );
}

function ApproverIdentity({ approver }: { approver: TimelineApprover }) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {approver.delegatedTo ? (
          <span className="min-w-0 break-words font-body text-sm text-white">
            {approver.name} <span className="text-muted">→</span> {approver.delegatedTo}
          </span>
        ) : (
          <span className="min-w-0 break-words font-body text-sm text-white">{approver.name}</span>
        )}
        <ApproverStatusPill status={approver.status} />
        {approver.delegatedTo ? <MiniBadge className="bg-navy/20 text-navy">Delegated</MiniBadge> : null}
        {approver.status === "escalated" ? <MiniBadge className="bg-warning/10 text-warning">Escalated</MiniBadge> : null}
        {approver.status === "timed_out" ? <MiniBadge className="bg-error/10 text-error">Timed out</MiniBadge> : null}
      </div>
      {approver.actedBy && approver.actedAt ? (
        <p className="mt-0.5 font-body text-xs font-light text-muted">
          {approver.actedBy} · {approver.actedAt.slice(0, 16).replace("T", " ")}
        </p>
      ) : null}
    </div>
  );
}

/* ── AI Advisory (read-only) ────────────────────────────────────────────── */
function AdvisoryPanel({ advisory }: { advisory: Advisory | "loading" | null }) {
  if (advisory === null || advisory === "loading") {
    return <Panel>{advisory === "loading" ? "Loading advisory…" : "Advisory not loaded."}</Panel>;
  }
  return (
    <div className="rounded-lg border border-line bg-card p-5">
      <p className="font-body text-[11px] font-bold uppercase tracking-[0.16em] text-muted">AI Advisory</p>

      {advisory.slaRisk ? (
        <p className="mt-3 font-body text-sm text-secondary">
          <span className="font-bold text-white">SLA risk:</span> {advisory.slaRisk.level}
          {advisory.slaRisk.hoursRemaining != null ? ` · ${advisory.slaRisk.hoursRemaining}h remaining` : ""}
        </p>
      ) : null}

      <p className="mt-2 font-body text-sm text-secondary">
        <span className="font-bold text-white">Summary:</span>{" "}
        {advisory.ai?.available
          ? advisory.ai.summary
          : `unavailable — ${advisory.ai?.reason ?? "not configured"}`}
      </p>

      {advisory.disclaimer ? (
        <p className="mt-4 border-t border-line pt-3 font-body text-xs font-light italic text-muted">
          {advisory.disclaimer}
        </p>
      ) : null}
    </div>
  );
}

/* ── Audit tab ──────────────────────────────────────────────────────────── */
const KIND_LABEL: Record<WorkflowAuditKind, string> = {
  approval: "Approvals",
  notification: "Notifications",
  delegation: "Delegation",
  sla: "SLA",
  escalation: "Escalation",
  timeout: "Timeout",
};

const KIND_PILL: Record<WorkflowAuditKind, string> = {
  approval: "bg-success/10 text-success",
  notification: "bg-white/5 text-secondary",
  delegation: "bg-navy/20 text-navy",
  sla: "bg-warning/10 text-warning",
  escalation: "bg-warning/10 text-warning",
  timeout: "bg-error/10 text-error",
};

function AuditTab({ entries }: { entries: WorkflowAuditEntry[] }) {
  const [filter, setFilter] = useState<WorkflowAuditKind | "all">("all");
  const present = Array.from(new Set(entries.map((e) => e.kind)));
  const shown = filter === "all" ? entries : entries.filter((e) => e.kind === filter);

  if (entries.length === 0) {
    return <Panel>No audit events recorded for this workflow yet.</Panel>;
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
          All
        </FilterChip>
        {present.map((k) => (
          <FilterChip key={k} active={filter === k} onClick={() => setFilter(k)}>
            {KIND_LABEL[k]}
          </FilterChip>
        ))}
      </div>

      <ol className="overflow-hidden rounded-lg border border-line">
        {shown.map((e, i) => (
          <li key={i} className={`flex items-start gap-3 bg-card px-4 py-3 ${i > 0 ? "border-t border-line" : ""}`}>
            <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 font-body text-[10px] font-bold uppercase tracking-wide ${KIND_PILL[e.kind]}`}>
              {e.kind}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-body text-[13px] text-white">
                {e.title}
                {e.actor ? <span className="font-light text-secondary"> · {e.actor}</span> : null}
              </p>
              {e.detail ? <p className="font-body text-xs font-light text-muted">{e.detail}</p> : null}
            </div>
            <span className="shrink-0 font-body text-xs font-light text-muted">
              {e.at.slice(0, 16).replace("T", " ")}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/* ── Shared primitives (portal design system) ──────────────────────────── */
function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`-mb-px border-b-2 px-3 py-2 font-body text-sm font-bold transition-colors ${
        active ? "border-white text-white" : "border-transparent text-muted hover:text-secondary"
      }`}
    >
      {children}
    </button>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1 font-body text-xs font-bold transition-colors ${
        active ? "bg-selected text-white" : "bg-white/5 text-muted hover:text-secondary"
      }`}
    >
      {children}
    </button>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-line-strong bg-card px-5 py-10 text-center font-body text-sm font-light text-muted">
      {children}
    </div>
  );
}

function MiniBadge({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span className={`rounded-full px-2 py-0.5 font-body text-[10px] font-bold uppercase tracking-wide ${className}`}>
      {children}
    </span>
  );
}

function StateMarker({ state }: { state: TimelineGroup["state"] }) {
  const map: Record<TimelineGroup["state"], string> = {
    done: "border-success bg-success/20 text-success",
    current: "border-warning bg-warning/20 text-warning",
    skipped: "border-line-strong bg-card text-muted",
    upcoming: "border-line-strong bg-card text-muted",
  };
  const glyph: Record<TimelineGroup["state"], string> = { done: "✓", current: "●", skipped: "⊘", upcoming: "○" };
  return (
    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border font-body text-[11px] ${map[state]}`}>
      {glyph[state]}
    </span>
  );
}

function StatePill({ state }: { state: TimelineGroup["state"] }) {
  const map: Record<TimelineGroup["state"], string> = {
    done: "bg-success/10 text-success",
    current: "bg-warning/10 text-warning",
    skipped: "bg-white/5 text-muted",
    upcoming: "bg-white/5 text-muted",
  };
  return <MiniBadge className={map[state]}>{state}</MiniBadge>;
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: "bg-warning/10 text-warning",
    approved: "bg-success/10 text-success",
    rejected: "bg-error/10 text-error",
    cancelled: "bg-white/5 text-muted",
  };
  return (
    <span className={`shrink-0 rounded-full px-2.5 py-0.5 font-body text-[11px] font-bold uppercase tracking-wide ${map[status] ?? "bg-white/5 text-muted"}`}>
      {status}
    </span>
  );
}

function ApproverStatusPill({ status }: { status: string | null }) {
  if (!status) return <MiniBadge className="bg-white/5 text-muted">upcoming</MiniBadge>;
  const map: Record<string, string> = {
    approved: "bg-success/10 text-success",
    rejected: "bg-error/10 text-error",
    pending: "bg-warning/10 text-warning",
    skipped: "bg-white/5 text-muted",
    escalated: "bg-warning/10 text-warning",
    timed_out: "bg-error/10 text-error",
  };
  return <MiniBadge className={map[status] ?? "bg-white/5 text-muted"}>{status.replace(/_/g, " ")}</MiniBadge>;
}
