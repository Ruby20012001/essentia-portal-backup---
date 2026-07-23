"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ProjectSummary } from "@/lib/services/project-hub";
import { inr, phaseLabel, ragBadgeClass, RAG_META } from "@/components/projects/format";

/**
 * Project Hub list (Brief · Project Hub) — every active project the user may see
 * (RLS-scoped server-side), red health first. Read-only entry point into each
 * project's central record. Financial columns appear only when the caller can
 * read billing. Reuses the portal design system.
 */

const ALL = "__all__";

export function ProjectHub({
  initial,
  canSeeFinancials,
}: {
  initial: ProjectSummary[];
  canSeeFinancials: boolean;
}) {
  const [search, setSearch] = useState("");
  const [phase, setPhase] = useState(ALL);
  const [rag, setRag] = useState(ALL);

  const phases = useMemo(() => [...new Set(initial.map((p) => p.currentPhase))].sort(), [initial]);

  const counts = useMemo(() => {
    const c = { total: initial.length, red: 0, amber: 0, green: 0, ar: 0 };
    for (const p of initial) {
      c[p.ragStatus] += 1;
      c.ar += p.arOutstanding ?? 0;
    }
    return c;
  }, [initial]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return initial.filter((p) => {
      if (phase !== ALL && p.currentPhase !== phase) return false;
      if (rag !== ALL && p.ragStatus !== rag) return false;
      if (!q) return true;
      return [p.projectCode, p.projectName, p.familyName, p.city]
        .filter(Boolean)
        .some((v) => (v as string).toLowerCase().includes(q));
    });
  }, [initial, search, phase, rag]);

  return (
    <div>
      {/* Summary */}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Card label="Projects" value={String(counts.total)} />
        <Card label="Red" value={String(counts.red)} tone="text-error" />
        <Card label="Amber" value={String(counts.amber)} tone="text-warning" />
        <Card label="Green" value={String(counts.green)} tone="text-success" />
        {canSeeFinancials ? <Card label="AR outstanding" value={inr(counts.ar)} /> : null}
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search code, name, family or city…"
          aria-label="Search projects"
          className="w-full rounded border border-line-strong bg-card px-3 py-2 font-body text-sm text-white placeholder:text-muted focus:border-white focus:outline-none lg:max-w-xs"
        />
        <div className="flex flex-wrap gap-2">
          <Select label="Phase" value={phase} onChange={setPhase}>
            <option value={ALL}>All phases</option>
            {phases.map((p) => (
              <option key={p} value={p}>
                {phaseLabel(p)}
              </option>
            ))}
          </Select>
          <Select label="Health" value={rag} onChange={setRag}>
            <option value={ALL}>All health</option>
            <option value="red">Red</option>
            <option value="amber">Amber</option>
            <option value="green">Green</option>
          </Select>
        </div>
      </div>

      {/* Table */}
      {initial.length === 0 ? (
        <Empty>No projects are visible to you yet.</Empty>
      ) : rows.length === 0 ? (
        <Empty>No projects match these filters.</Empty>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full min-w-[860px] text-left font-body text-[13.5px]">
            <thead>
              <tr className="bg-surface text-[11px] uppercase tracking-[0.12em] text-secondary">
                <th className="px-4 py-2.5 font-bold">Project</th>
                <th className="px-4 py-2.5 font-bold">Family</th>
                <th className="px-4 py-2.5 font-bold">Phase</th>
                <th className="px-4 py-2.5 font-bold">Health</th>
                <th className="px-4 py-2.5 font-bold">CRM TL</th>
                {canSeeFinancials ? <th className="px-4 py-2.5 font-bold">Value</th> : null}
                {canSeeFinancials ? <th className="px-4 py-2.5 font-bold">AR</th> : null}
                <th className="px-4 py-2.5 font-bold">Target DoR</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="border-t border-line bg-card align-top transition-colors hover:bg-hover">
                  <td className="px-4 py-2.5">
                    <Link href={`/projects/${p.id}`} className="font-bold text-white hover:underline">
                      {p.projectCode}
                    </Link>
                    <span className="block font-body text-xs font-light text-muted">
                      {p.projectName ?? "—"}
                      {p.isDubai ? <span className="text-secondary"> · Dubai</span> : null}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 font-light text-secondary">
                    {p.familyName ?? "—"}
                    {p.city ? <span className="block text-xs text-muted">{p.city}</span> : null}
                  </td>
                  <td className="px-4 py-2.5 font-light text-secondary">{phaseLabel(p.currentPhase)}</td>
                  <td className="px-4 py-2.5">
                    <span className={ragBadgeClass(p.ragStatus)}>{RAG_META[p.ragStatus].label}</span>
                  </td>
                  <td className="px-4 py-2.5 font-light text-secondary">{p.crmTl ?? "—"}</td>
                  {canSeeFinancials ? <td className="px-4 py-2.5 font-light text-secondary">{inr(p.projectValueEst)}</td> : null}
                  {canSeeFinancials ? (
                    <td className={`px-4 py-2.5 font-light ${p.arOutstanding && p.arOutstanding > 0 ? "text-warning" : "text-muted"}`}>
                      {inr(p.arOutstanding)}
                    </td>
                  ) : null}
                  <td className="whitespace-nowrap px-4 py-2.5 font-light text-muted">{p.targetDorDate ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {rows.length !== initial.length ? (
        <p className="mt-3 font-body text-xs font-light text-muted">
          Showing {rows.length} of {initial.length} projects.
        </p>
      ) : null}
    </div>
  );
}

function Card({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-line bg-card p-4">
      <p className="font-body text-[11px] font-bold uppercase tracking-[0.12em] text-muted">{label}</p>
      <p className={`mt-1 font-heading text-2xl ${tone ?? "text-white"}`}>{value}</p>
    </div>
  );
}

function Select({ label, value, onChange, children }: { label: string; value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <label className="flex items-center gap-2">
      <span className="sr-only">{label}</span>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded border border-line-strong bg-card px-3 py-2 font-body text-sm text-secondary focus:border-white focus:outline-none"
      >
        {children}
      </select>
    </label>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-line-strong bg-card px-5 py-12 text-center font-body text-sm font-light text-muted">
      {children}
    </p>
  );
}
