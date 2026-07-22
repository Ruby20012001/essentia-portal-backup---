"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { SlaMonitorCounts, SlaTrendPoint } from "@/lib/services/workflow-sla-monitor";

/**
 * SLA Monitor (Phase 4 frontend, screen 8) — the org-wide health of every
 * workflow deadline: how many are approaching, breached, escalated or timed out,
 * a 14-day warning/breach trend, and the live list of in-flight items ranked by
 * risk. Read-only; acting happens on My Approvals. Reuses the portal design
 * system only (card / surface / line tokens, the pill and Lato scale).
 */

export type RiskLevel = "none" | "ok" | "medium" | "high" | "breached";

export type RiskItem = {
  instanceId: string;
  workflowName: string;
  resourceRef: string | null;
  resourceType: string;
  groupName: string;
  pendingCount: number;
  quorum: number;
  startedAt: string;
  startedBy: string | null;
  waitingOn: string | null;
  slaDueAt: string | null;
  riskLevel: RiskLevel;
  hoursRemaining: number | null;
};

const ALL = "__all__";

export function SlaMonitor({
  counts,
  trend,
  items,
}: {
  counts: SlaMonitorCounts;
  trend: SlaTrendPoint[];
  items: RiskItem[];
}) {
  const [risk, setRisk] = useState<string>(ALL);

  const rows = useMemo(() => {
    const bucket = (r: RiskLevel) =>
      r === "breached" ? "breached" : r === "high" || r === "medium" ? "approaching" : r === "ok" ? "ontrack" : "nosla";
    const ordered = [...items].sort((a, b) => RISK_RANK[b.riskLevel] - RISK_RANK[a.riskLevel]);
    if (risk === ALL) return ordered;
    return ordered.filter((i) => bucket(i.riskLevel) === risk);
  }, [items, risk]);

  return (
    <div>
      {/* Headline SLA numbers */}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <SummaryCard label="Approaching" value={counts.approaching} tone="text-warning" sub="warned, still pending" />
        <SummaryCard label="Breached" value={counts.breached} tone="text-error" sub="past deadline, pending" />
        <SummaryCard label="Escalated" value={counts.escalated} tone="text-secondary" sub="handed to a target" />
        <SummaryCard label="Timed out" value={counts.timedOut} tone="text-muted" sub="closed by timeout" />
      </div>

      {/* Trend */}
      <section className="mb-8 rounded-lg border border-line bg-card p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="font-body text-sm font-bold text-white">
            SLA activity <span className="font-light text-muted">· last {trend.length} days</span>
          </h2>
          <div className="flex items-center gap-4 font-body text-xs text-muted">
            <Legend swatch="bg-warning" label="Warnings" />
            <Legend swatch="bg-error" label="Breaches" />
          </div>
        </div>
        <TrendChart trend={trend} />
      </section>

      {/* At-risk items */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="font-body text-sm font-bold text-white">
          In flight <span className="font-light text-muted">· {items.length}</span>
        </h2>
        <label className="flex items-center gap-2">
          <span className="sr-only">Filter by risk</span>
          <select
            aria-label="Filter by risk"
            value={risk}
            onChange={(e) => setRisk(e.target.value)}
            className="rounded border border-line-strong bg-card px-3 py-2 font-body text-sm text-secondary focus:border-white focus:outline-none"
          >
            <option value={ALL}>All risk levels</option>
            <option value="breached">Breached</option>
            <option value="approaching">Approaching</option>
            <option value="ontrack">On track</option>
            <option value="nosla">No SLA</option>
          </select>
        </label>
      </div>

      {items.length === 0 ? (
        <Empty>Nothing is in flight. When a workflow is awaiting a decision it appears here.</Empty>
      ) : rows.length === 0 ? (
        <Empty>No in-flight workflow matches this risk level.</Empty>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full min-w-[820px] text-left font-body text-[13.5px]">
            <thead>
              <tr className="bg-surface text-[11px] uppercase tracking-[0.12em] text-secondary">
                <th className="px-4 py-2.5 font-bold">Workflow</th>
                <th className="px-4 py-2.5 font-bold">Stage</th>
                <th className="px-4 py-2.5 font-bold">Waiting on</th>
                <th className="px-4 py-2.5 font-bold">SLA</th>
                <th className="px-4 py-2.5 font-bold">Started</th>
                <th className="px-4 py-2.5 text-right font-bold">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((i) => (
                <tr key={i.instanceId} className="border-t border-line bg-card align-top transition-colors hover:bg-hover">
                  <td className="px-4 py-2.5">
                    <span className="block font-bold text-white">{i.workflowName}</span>
                    <span className="block font-body text-xs font-light text-muted">{i.resourceRef ?? "—"}</span>
                  </td>
                  <td className="px-4 py-2.5 font-light text-secondary">
                    {i.groupName}
                    {i.quorum > 1 ? <span className="text-muted"> · {i.pendingCount} awaiting</span> : null}
                  </td>
                  <td className="px-4 py-2.5 font-light text-secondary">{i.waitingOn ?? "—"}</td>
                  <td className="px-4 py-2.5">
                    <RiskBadge level={i.riskLevel} hoursRemaining={i.hoursRemaining} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 font-light text-muted">
                    {i.startedAt.slice(0, 10)}
                    {i.startedBy ? <span className="block text-xs">by {i.startedBy}</span> : null}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Link
                      href={`/workflows/${i.instanceId}`}
                      className="inline-block rounded-lg border border-line-strong px-3 py-1.5 font-body text-xs font-bold text-white transition-colors hover:bg-hover"
                    >
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const RISK_RANK: Record<RiskLevel, number> = { breached: 4, high: 3, medium: 2, ok: 1, none: 0 };

function RiskBadge({ level, hoursRemaining }: { level: RiskLevel; hoursRemaining: number | null }) {
  const map: Record<RiskLevel, { cls: string; label: string }> = {
    breached: { cls: "bg-error/10 text-error", label: "Breached" },
    high: { cls: "bg-error/10 text-error", label: hoursRemaining != null ? `Due in ${Math.round(hoursRemaining)}h` : "Due soon" },
    medium: { cls: "bg-warning/10 text-warning", label: hoursRemaining != null ? `Due in ${Math.round(hoursRemaining)}h` : "Due soon" },
    ok: { cls: "bg-success/10 text-success", label: hoursRemaining != null ? `Due in ${Math.round(hoursRemaining)}h` : "On track" },
    none: { cls: "bg-white/5 text-muted", label: "No SLA" },
  };
  const s = map[level];
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 font-body text-[10px] font-bold uppercase tracking-wide ${s.cls}`}>
      {s.label}
    </span>
  );
}

function TrendChart({ trend }: { trend: SlaTrendPoint[] }) {
  const max = Math.max(1, ...trend.map((p) => Math.max(p.warnings, p.breaches)));
  const total = trend.reduce((n, p) => n + p.warnings + p.breaches, 0);

  if (total === 0) {
    return (
      <p className="py-6 text-center font-body text-sm font-light text-muted">
        No SLA warnings or breaches in the last {trend.length} days.
      </p>
    );
  }

  return (
    <div>
      <div className="flex h-28 items-end gap-1.5">
        {trend.map((p) => (
          <div key={p.day} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${p.day}: ${p.warnings} warning(s), ${p.breaches} breach(es)`}>
            <div className="flex h-full w-full items-end justify-center gap-0.5">
              <span className="w-1/2 max-w-[8px] rounded-sm bg-warning" style={{ height: `${(p.warnings / max) * 100}%` }} />
              <span className="w-1/2 max-w-[8px] rounded-sm bg-error" style={{ height: `${(p.breaches / max) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between font-body text-[10px] text-muted">
        <span>{trend[0]?.day.slice(5)}</span>
        <span>{trend[trend.length - 1]?.day.slice(5)}</span>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, tone, sub }: { label: string; value: number; tone: string; sub: string }) {
  return (
    <div className="rounded-lg border border-line bg-card p-4">
      <p className="font-body text-[11px] font-bold uppercase tracking-[0.12em] text-muted">{label}</p>
      <p className={`mt-1 font-heading text-3xl ${tone}`}>{value}</p>
      <p className="mt-0.5 font-body text-xs font-light text-muted">{sub}</p>
    </div>
  );
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`inline-block h-2.5 w-2.5 rounded-sm ${swatch}`} />
      {label}
    </span>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-line-strong bg-card px-5 py-12 text-center font-body text-sm font-light text-muted">
      {children}
    </p>
  );
}
