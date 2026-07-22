"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type {
  DelegationDetail,
  DelegationStatus,
  DelegationSummary,
  DelegationTask,
} from "@/lib/services/workflow-delegations";

/**
 * Active Delegations (Phase 4 frontend, screen 7) — the admin register of every
 * standing workflow delegation, with monitoring and revocation. Read-only over
 * the engine: it never delegates or approves; the only write is the existing
 * revoke endpoint. Leadership / platform admin only (gated on the page).
 *
 * Reuses the portal design system (card / surface / line tokens, the pill and
 * Lato scale) — no new visual language.
 */

type Banner = { tone: "error" | "success"; message: string };

const ALL = "__all__";

export function ActiveDelegations({ initial }: { initial: DelegationSummary[] }) {
  const router = useRouter();
  const [banner, setBanner] = useState<Banner | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>(ALL);
  const [dept, setDept] = useState<string>(ALL);
  const [scope, setScope] = useState<string>(ALL);
  const [openId, setOpenId] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<DelegationSummary | null>(null);
  const [busy, setBusy] = useState(false);

  const departments = useMemo(
    () => [...new Set(initial.map((d) => d.delegatorDepartment).filter(Boolean) as string[])].sort(),
    [initial],
  );
  const scopes = useMemo(
    () => [...new Set(initial.map((d) => d.scopeLabel))].sort(),
    [initial],
  );

  const counts = useMemo(() => {
    const c = { total: initial.length, active: 0, scheduled: 0, revoked: 0, expired: 0, pending: 0 };
    for (const d of initial) {
      c[d.status] += 1;
      if (d.status === "active") c.pending += d.pendingCount;
    }
    return c;
  }, [initial]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return initial.filter((d) => {
      if (status !== ALL && d.status !== status) return false;
      if (dept !== ALL && d.delegatorDepartment !== dept) return false;
      if (scope !== ALL && d.scopeLabel !== scope) return false;
      if (!q) return true;
      return [d.delegatorName, d.delegateName, d.createdByName, d.scopeLabel, d.reason]
        .filter(Boolean)
        .some((v) => (v as string).toLowerCase().includes(q));
    });
  }, [initial, search, status, dept, scope]);

  async function revoke(d: DelegationSummary) {
    setBusy(true);
    setBanner(null);
    try {
      const res = await fetch(`/api/workflows/delegations/${d.id}/revoke`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setBanner({ tone: "error", message: data.error ?? `Revoke failed (${res.status})` });
        return;
      }
      setRevoking(null);
      setBanner({
        tone: "success",
        message: `Delegation revoked — new ${d.scopeLabel === "All workflows" ? "" : `${d.scopeLabel} `}approvals route back to ${d.delegatorName}.`,
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const filtered = rows.length !== initial.length;

  return (
    <div>
      {banner ? (
        <div
          role="alert"
          className={`mb-6 rounded-lg border-l-4 px-5 py-3 font-body text-sm ${
            banner.tone === "error"
              ? "border-error bg-error/5 font-bold text-error"
              : "border-success bg-success/5 font-light text-success"
          }`}
        >
          {banner.message}
        </div>
      ) : null}

      {/* Summary cards */}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <SummaryCard label="Active" value={counts.active} tone="text-success" />
        <SummaryCard label="Scheduled" value={counts.scheduled} tone="text-warning" />
        <SummaryCard label="Pending approvals" value={counts.pending} />
        <SummaryCard label="Expired" value={counts.expired} tone="text-secondary" />
        <SummaryCard label="Revoked" value={counts.revoked} tone="text-error" />
        <SummaryCard label="Total" value={counts.total} />
      </div>

      {/* Toolbar: search + filters */}
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search person, scope or reason…"
          aria-label="Search delegations"
          className="w-full rounded border border-line-strong bg-card px-3 py-2 font-body text-sm text-white placeholder:text-muted focus:border-white focus:outline-none lg:max-w-xs"
        />
        <div className="flex flex-wrap gap-2">
          <Select label="Status" value={status} onChange={setStatus}>
            <option value={ALL}>All statuses</option>
            <option value="active">Active</option>
            <option value="scheduled">Scheduled</option>
            <option value="expired">Expired</option>
            <option value="revoked">Revoked</option>
          </Select>
          <Select label="Department" value={dept} onChange={setDept}>
            <option value={ALL}>All departments</option>
            {departments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </Select>
          <Select label="Scope" value={scope} onChange={setScope}>
            <option value={ALL}>All scopes</option>
            {scopes.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {/* Table */}
      {initial.length === 0 ? (
        <Empty>No delegations exist yet. When someone delegates their approvals, it appears here.</Empty>
      ) : rows.length === 0 ? (
        <Empty>No delegations match these filters.</Empty>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full min-w-[960px] text-left font-body text-[13.5px]">
            <thead>
              <tr className="bg-surface text-[11px] uppercase tracking-[0.12em] text-secondary">
                <th className="px-4 py-2.5 font-bold">Original assignee</th>
                <th className="px-4 py-2.5 font-bold">Delegate</th>
                <th className="px-4 py-2.5 font-bold">Type</th>
                <th className="px-4 py-2.5 font-bold">Scope</th>
                <th className="px-4 py-2.5 font-bold">Effective dates</th>
                <th className="px-4 py-2.5 font-bold">Status</th>
                <th className="px-4 py-2.5 font-bold">Created by</th>
                <th className="px-4 py-2.5 font-bold">Department</th>
                <th className="px-4 py-2.5 font-bold">Last updated</th>
                <th className="px-4 py-2.5 text-right font-bold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id} className="border-t border-line bg-card align-top transition-colors hover:bg-hover">
                  <td className="px-4 py-2.5 font-bold text-white">{d.delegatorName}</td>
                  <td className="px-4 py-2.5 font-light text-secondary">{d.delegateName}</td>
                  <td className="px-4 py-2.5 font-light capitalize text-secondary">{d.type}</td>
                  <td className="px-4 py-2.5 font-light text-secondary">{d.scopeLabel}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 font-light text-secondary">
                    {d.fromDate} <span className="text-muted">→</span> {d.toDate}
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={d.status} />
                    {d.status === "active" && d.pendingCount > 0 ? (
                      <span className="mt-1 block font-body text-xs text-muted">{d.pendingCount} pending</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-2.5 font-light text-secondary">{d.createdByName ?? "—"}</td>
                  <td className="px-4 py-2.5 font-light text-secondary">{d.delegatorDepartment ?? "—"}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 font-light text-muted">{fmtDate(d.lastUpdated)}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap justify-end gap-2">
                      <button type="button" className={ghost} onClick={() => setOpenId(d.id)}>
                        View
                      </button>
                      <OpenWorkflow instanceId={d.openInstanceId} />
                      {canRevoke(d.status) ? (
                        <button type="button" className={danger} onClick={() => setRevoking(d)}>
                          Revoke
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {filtered ? (
        <p className="mt-3 font-body text-xs font-light text-muted">
          Showing {rows.length} of {initial.length} delegations.
        </p>
      ) : null}

      {openId ? (
        <DetailDrawer
          id={openId}
          onClose={() => setOpenId(null)}
          onRevoke={(summary) => setRevoking(summary)}
        />
      ) : null}

      {revoking ? (
        <RevokeDialog
          delegation={revoking}
          busy={busy}
          onCancel={() => setRevoking(null)}
          onConfirm={() => revoke(revoking)}
        />
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Detail drawer — fetches the read-only aggregation on open.          */
/* ------------------------------------------------------------------ */

function DetailDrawer({
  id,
  onClose,
  onRevoke,
}: {
  id: string;
  onClose: () => void;
  onRevoke: (summary: DelegationSummary) => void;
}) {
  const [detail, setDetail] = useState<DelegationDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch the read-only aggregation when the drawer opens (or the id changes).
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    setDetail(null);
    fetch(`/api/workflows/delegations/${id}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!alive) return;
        if (!res.ok) setError(data.error ?? `Could not load delegation (${res.status})`);
        else setDetail(data.detail as DelegationDetail);
      })
      .catch(() => {
        if (alive) setError("Could not load delegation.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [id]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Delegation detail">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/70" />
      <div className="relative flex h-full w-full max-w-xl flex-col border-l border-line bg-card">
        <div className="flex items-start justify-between gap-3 border-b border-line px-6 py-4">
          <div className="min-w-0">
            <p className="font-body text-[11px] font-bold uppercase tracking-[0.14em] text-muted">Delegation</p>
            <h2 className="mt-0.5 break-words font-heading text-2xl text-white">
              {detail ? `${detail.delegatorName} → ${detail.delegateName}` : "Loading…"}
            </h2>
          </div>
          <button type="button" onClick={onClose} className={ghost} aria-label="Close drawer">
            Close
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {loading ? (
            <p className="font-body text-sm font-light text-muted">Loading delegation…</p>
          ) : error ? (
            <p className="rounded-lg border border-error/40 bg-error/5 px-4 py-3 font-body text-sm font-bold text-error">
              {error}
            </p>
          ) : detail ? (
            <DrawerBody detail={detail} onRevoke={onRevoke} />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function DrawerBody({
  detail,
  onRevoke,
}: {
  detail: DelegationDetail;
  onRevoke: (summary: DelegationSummary) => void;
}) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={detail.status} />
        <span className="rounded-full bg-white/5 px-2 py-0.5 font-body text-[10px] font-bold uppercase tracking-wide text-secondary">
          {detail.type}
        </span>
      </div>

      {/* Identity + terms */}
      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
        <Field label="Original assignee" value={detail.delegatorName} />
        <Field label="Delegate" value={detail.delegateName} />
        <Field label="Workflow scope" value={detail.scopeLabel} />
        <Field label="Effective dates" value={`${detail.fromDate} → ${detail.toDate}`} />
        <Field label="Created by" value={detail.createdByName ?? "—"} />
        <Field label="Department" value={detail.delegatorDepartment ?? "—"} />
        <Field label="Last updated" value={fmtDateTime(detail.lastUpdated)} />
        <Field label="Created" value={fmtDateTime(detail.createdAt)} />
        <div className="sm:col-span-2">
          <Field label="Reason" value={detail.reason ?? "—"} />
        </div>
      </dl>

      {/* Actions */}
      <div className="flex flex-wrap gap-2 border-t border-line pt-4">
        <OpenWorkflow instanceId={detail.openInstanceId} wide />
        {canRevoke(detail.status) ? (
          <button type="button" className={danger} onClick={() => onRevoke(detail)}>
            Revoke delegation
          </button>
        ) : null}
      </div>

      <Section title="Pending approvals" count={detail.pendingApprovals.length}>
        {detail.pendingApprovals.length === 0 ? (
          <Muted>No approvals are currently waiting on the delegate.</Muted>
        ) : (
          <ul className="space-y-2">
            {detail.pendingApprovals.map((t) => (
              <TaskRow key={`${t.instanceId}-${t.groupNo}`} task={t} showSla />
            ))}
          </ul>
        )}
      </Section>

      <Section title="Tasks affected" count={detail.tasksAffected.length}>
        {detail.tasksAffected.length === 0 ? (
          <Muted>This delegation has not routed any tasks yet.</Muted>
        ) : (
          <ul className="space-y-2">
            {detail.tasksAffected.map((t) => (
              <TaskRow key={`${t.instanceId}-${t.groupNo}`} task={t} />
            ))}
          </ul>
        )}
      </Section>

      <Section title="Audit history" count={detail.audit.length}>
        {detail.audit.length === 0 ? (
          <Muted>No audit entries.</Muted>
        ) : (
          <ul className="space-y-2">
            {detail.audit.map((a, i) => (
              <li key={i} className="flex items-baseline justify-between gap-3 border-b border-line pb-2 last:border-0">
                <span className="font-body text-sm text-secondary">
                  {a.action}
                  {a.actor ? <span className="text-muted"> · {a.actor}</span> : null}
                </span>
                <span className="shrink-0 font-body text-xs text-muted">{fmtDateTime(a.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Notification history" count={detail.notifications.length}>
        {detail.notifications.length === 0 ? (
          <Muted>No notifications sent.</Muted>
        ) : (
          <ul className="space-y-2">
            {detail.notifications.map((n, i) => (
              <li key={i} className="flex items-baseline justify-between gap-3 border-b border-line pb-2 last:border-0">
                <span className="min-w-0 font-body text-sm text-secondary">
                  <span className="capitalize">{n.eventType}</span>
                  {n.recipient ? <span className="text-muted"> · to {n.recipient}</span> : null}
                  {n.channel ? <span className="text-muted"> · {n.channel}</span> : null}
                  {n.status ? <span className="text-muted"> · {n.status}</span> : null}
                </span>
                <span className="shrink-0 font-body text-xs text-muted">{fmtDateTime(n.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Revoke confirmation                                                 */
/* ------------------------------------------------------------------ */

function RevokeDialog({
  delegation,
  busy,
  onCancel,
  onConfirm,
}: {
  delegation: DelegationSummary;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <button type="button" aria-label="Cancel" onClick={onCancel} className="absolute inset-0 bg-black/70" />
      <div className="relative w-full max-w-md rounded-lg border border-line bg-card p-6">
        <h3 className="font-heading text-2xl text-white">Revoke delegation</h3>
        <p className="mt-2 font-body text-sm font-light text-secondary">
          Stop <span className="text-white">{delegation.delegateName}</span> from receiving{" "}
          <span className="text-white">
            {delegation.scopeLabel === "All workflows" ? "all workflow" : delegation.scopeLabel}
          </span>{" "}
          approvals delegated from <span className="text-white">{delegation.delegatorName}</span>?
        </p>
        <p className="mt-2 font-body text-xs font-light text-muted">
          New approvals route back to {delegation.delegatorName}. Approvals already delegated remain with{" "}
          {delegation.delegateName} until actioned. This cannot be undone.
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className={ghost} disabled={busy}>
            Cancel
          </button>
          <button type="button" onClick={onConfirm} disabled={busy} className={dangerSolid}>
            {busy ? "Revoking…" : "Revoke"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Small building blocks                                               */
/* ------------------------------------------------------------------ */

function SummaryCard({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-lg border border-line bg-card p-4">
      <p className="font-body text-[11px] font-bold uppercase tracking-[0.12em] text-muted">{label}</p>
      <p className={`mt-1 font-heading text-3xl ${tone ?? "text-white"}`}>{value}</p>
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
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

function StatusBadge({ status }: { status: DelegationStatus }) {
  const map: Record<DelegationStatus, { cls: string; label: string }> = {
    active: { cls: "bg-success/10 text-success", label: "Active" },
    scheduled: { cls: "bg-warning/10 text-warning", label: "Scheduled" },
    expired: { cls: "bg-white/5 text-secondary", label: "Expired" },
    revoked: { cls: "bg-error/10 text-error", label: "Revoked" },
  };
  const s = map[status];
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 font-body text-[10px] font-bold uppercase tracking-wide ${s.cls}`}>
      {s.label}
    </span>
  );
}

function OpenWorkflow({ instanceId, wide }: { instanceId: string | null; wide?: boolean }) {
  const base = wide ? `${ghost} px-4` : ghost;
  if (!instanceId) {
    return (
      <span
        className={`${base} cursor-not-allowed opacity-40`}
        title="Open workflow is available when exactly one instance is currently pending on the delegate."
        aria-disabled="true"
      >
        Open workflow
      </span>
    );
  }
  return (
    <Link href={`/workflows/${instanceId}`} className={base}>
      Open workflow
    </Link>
  );
}

function TaskRow({ task, showSla }: { task: DelegationTask; showSla?: boolean }) {
  return (
    <li className="rounded-lg border border-line bg-canvas px-3 py-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={`/workflows/${task.instanceId}`} className="font-body text-sm font-bold text-white hover:underline">
            {task.workflowName ?? task.workflowCode}
          </Link>
          <p className="font-body text-xs font-light text-muted">
            {task.resourceType} · Step {task.groupNo}
            {showSla && task.slaDueAt ? <span> · due {fmtDate(task.slaDueAt)}</span> : null}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-white/5 px-2 py-0.5 font-body text-[10px] font-bold uppercase tracking-wide text-secondary">
          {task.taskStatus}
        </span>
      </div>
    </li>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 font-body text-[11px] font-bold uppercase tracking-[0.14em] text-muted">
        {title} <span className="text-secondary">({count})</span>
      </h3>
      {children}
    </section>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-body text-[11px] font-bold uppercase tracking-[0.1em] text-muted">{label}</dt>
      <dd className="mt-0.5 break-words font-body text-sm font-light text-white">{value}</dd>
    </div>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return <p className="font-body text-sm font-light text-muted">{children}</p>;
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-line-strong bg-card px-5 py-12 text-center font-body text-sm font-light text-muted">
      {children}
    </p>
  );
}

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

function canRevoke(status: DelegationStatus): boolean {
  return status === "active" || status === "scheduled";
}

function fmtDate(iso: string): string {
  return iso ? iso.slice(0, 10) : "—";
}

function fmtDateTime(iso: string): string {
  if (!iso) return "—";
  return iso.replace("T", " ").slice(0, 16);
}

const ghost =
  "rounded-lg border border-line-strong px-3 py-1.5 font-body text-xs font-bold text-white transition-colors hover:bg-hover disabled:opacity-40";
const danger =
  "rounded-lg border border-error/40 px-3 py-1.5 font-body text-xs font-bold text-error transition-colors hover:bg-error/5 disabled:opacity-40";
const dangerSolid =
  "rounded-lg border border-error/40 bg-error/10 px-4 py-1.5 font-body text-xs font-bold text-error transition-colors hover:bg-error/20 disabled:opacity-40";
