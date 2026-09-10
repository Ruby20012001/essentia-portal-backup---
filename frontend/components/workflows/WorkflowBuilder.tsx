"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { describeCondition } from "@/lib/services/workflow-conditions";
import {
  ACCESS_LEVELS,
  APPROVER_TYPES,
  REJECT_POLICIES,
  TIMEOUT_ACTIONS,
  validateDefinitionStructure,
  type BuilderApprover,
  type BuilderGroup,
  type ValidationIssue,
} from "@/lib/services/workflow-builder-shared";
import type { BuilderOptions, WorkflowDefinitionDetail } from "@/lib/services/workflow-builder";

/**
 * Workflow Builder (Phase 4 frontend, screen 5) — the visual editor for a
 * definition's approval chain: groups in sequence, parallel approvers + quorum,
 * conditions, and SLA / warning / timeout / escalation per group. Editing is
 * offered only when the definition is editable (draft/inactive AND no running
 * instances); otherwise the chain is shown read-only with a Duplicate action.
 * All persistence goes through the builder API (PATCH meta, PUT structure,
 * POST activate) — no engine, scheduler or notification code is touched.
 */

type Banner = { tone: "error" | "success"; message: string };
type Meta = { name: string; resourceType: string | null; description: string | null };

const OPERATORS = ["==", "!=", ">", ">=", "<", "<="] as const;

export function WorkflowBuilder({
  detail,
  options,
}: {
  detail: WorkflowDefinitionDetail;
  options: BuilderOptions;
}) {
  const router = useRouter();
  const [meta, setMeta] = useState<Meta>({
    name: detail.name,
    resourceType: detail.resourceType,
    description: detail.description,
  });
  const [groups, setGroups] = useState<BuilderGroup[]>(() =>
    detail.groups.map((g) => ({
      name: g.name,
      quorum: g.quorum,
      rejectPolicy: g.rejectPolicy,
      condition: g.condition ?? null,
      slaHours: g.slaHours,
      warnHours: g.warnHours,
      timeoutHours: g.timeoutHours,
      timeoutAction: g.timeoutAction,
      reminderHours: g.reminderHours,
      approvers: g.approvers.map(stripApprover),
    })),
  );
  const [banner, setBanner] = useState<Banner | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [duplicating, setDuplicating] = useState(false);

  const issues = useMemo(() => validateDefinitionStructure(groups), [groups]);
  const errorCount = issues.filter((i) => i.level === "error").length;

  const editable = detail.editable;

  function patchGroup(idx: number, patch: Partial<BuilderGroup>) {
    setGroups((gs) => gs.map((g, i) => (i === idx ? { ...g, ...patch } : g)));
  }
  function moveGroup(idx: number, dir: -1 | 1) {
    setGroups((gs) => {
      const next = [...gs];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return gs;
      [next[idx], next[j]] = [next[j]!, next[idx]!];
      return next;
    });
  }
  function removeGroup(idx: number) {
    setGroups((gs) => gs.filter((_, i) => i !== idx));
  }
  function addGroup() {
    setGroups((gs) => [
      ...gs,
      {
        name: `Group ${gs.length + 1}`,
        quorum: 1,
        rejectPolicy: "fail_fast",
        condition: null,
        slaHours: null,
        warnHours: null,
        timeoutHours: null,
        timeoutAction: null,
        reminderHours: null,
        approvers: [],
      },
    ]);
  }

  async function api(path: string, init: RequestInit, label: string): Promise<Record<string, unknown> | null> {
    setBusy(label);
    setBanner(null);
    try {
      const res = await fetch(path, init);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setBanner({ tone: "error", message: (data as { error?: string }).error ?? `Request failed (${res.status})` });
        return null;
      }
      return data as Record<string, unknown>;
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    // Metadata first, then structure — both refuse on a non-editable definition.
    const m = await api(
      `/api/workflows/definitions/${detail.code}`,
      { method: "PATCH", headers: json, body: JSON.stringify(meta) },
      "save",
    );
    if (!m) return;
    const s = await api(
      `/api/workflows/definitions/${detail.code}/structure`,
      { method: "PUT", headers: json, body: JSON.stringify({ groups }) },
      "save",
    );
    if (!s) return;
    setBanner({
      tone: "success",
      message: `Saved — ${s.groups} group${s.groups === 1 ? "" : "s"}, ${s.approvers} approver${s.approvers === 1 ? "" : "s"}. ${errorCount === 0 ? "Ready to activate." : `${errorCount} issue${errorCount === 1 ? "" : "s"} to fix before activation.`}`,
    });
    router.refresh();
  }

  async function activate() {
    // Persist the current state first so activation validates what's on screen.
    const m = await api(`/api/workflows/definitions/${detail.code}`, { method: "PATCH", headers: json, body: JSON.stringify(meta) }, "activate");
    if (!m) return;
    const s = await api(`/api/workflows/definitions/${detail.code}/structure`, { method: "PUT", headers: json, body: JSON.stringify({ groups }) }, "activate");
    if (!s) return;
    const a = await api(`/api/workflows/definitions/${detail.code}/activate`, { method: "POST" }, "activate");
    if (!a) return;
    router.push("/workflow-definitions");
  }

  async function archive() {
    const a = await api(`/api/workflows/definitions/${detail.code}/archive`, { method: "POST" }, "archive");
    if (a) router.push("/workflow-definitions");
  }
  async function restore() {
    const a = await api(`/api/workflows/definitions/${detail.code}/archive`, { method: "DELETE" }, "restore");
    if (a) router.push("/workflow-definitions");
  }

  return (
    <div className="pb-24">
      {banner ? (
        <div
          role="alert"
          className={`mb-6 rounded-lg border-l-4 px-5 py-3 font-body text-sm ${
            banner.tone === "error" ? "border-error bg-error/5 font-bold text-error" : "border-success bg-success/5 font-light text-success"
          }`}
        >
          {banner.message}
        </div>
      ) : null}

      {!editable ? (
        <div className="mb-6 rounded-lg border border-line-strong bg-surface px-5 py-4">
          <p className="font-body text-sm text-secondary">
            {detail.isActive
              ? "This workflow is active, so its chain is read-only."
              : `This workflow has ${detail.runningCount} running instance${detail.runningCount === 1 ? "" : "s"}, so it can't be edited.`}{" "}
            To change it: <span className="text-white">duplicate → edit the copy → activate → archive this one</span>.
          </p>
          <button type="button" onClick={() => setDuplicating(true)} className={`${ghost} mt-3`}>
            Duplicate to edit
          </button>
        </div>
      ) : null}

      {/* Metadata */}
      <section className="mb-6 rounded-lg border border-line bg-card p-5">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Name">
            <input className={input} value={meta.name} disabled={!editable} onChange={(e) => setMeta({ ...meta, name: e.target.value })} />
          </Field>
          <Field label="Code">
            <input className={`${input} opacity-60`} value={detail.code} readOnly />
          </Field>
          <Field label="Module">
            <select
              className={input}
              value={meta.resourceType ?? ""}
              disabled={!editable}
              onChange={(e) => setMeta({ ...meta, resourceType: e.target.value || null })}
            >
              <option value="">— none —</option>
              {options.resourceTypes.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.name} ({r.code})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Status">
            <StatusBadge isActive={detail.isActive} runningCount={detail.runningCount} />
          </Field>
        </div>
        <Field label="Description" className="mt-4">
          <textarea
            className={`${input} min-h-[64px]`}
            value={meta.description ?? ""}
            disabled={!editable}
            onChange={(e) => setMeta({ ...meta, description: e.target.value || null })}
          />
        </Field>
      </section>

      {/* Validation */}
      {editable ? <ValidationPanel issues={issues} /> : null}

      {/* Groups */}
      <ol className="space-y-4">
        {groups.map((g, i) => (
          <li key={i}>
            {editable ? (
              <GroupCard
                index={i}
                group={g}
                total={groups.length}
                options={options}
                onChange={(patch) => patchGroup(i, patch)}
                onMove={(dir) => moveGroup(i, dir)}
                onRemove={() => removeGroup(i)}
              />
            ) : (
              <ReadOnlyGroup index={i} group={g} options={options} />
            )}
          </li>
        ))}
      </ol>

      {groups.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line-strong bg-card px-5 py-10 text-center font-body text-sm font-light text-muted">
          No groups yet. {editable ? "Add the first approval group to begin." : "This definition has no groups."}
        </p>
      ) : null}

      {editable ? (
        <button type="button" onClick={addGroup} className={`${ghost} mt-4`}>
          + Add group
        </button>
      ) : null}

      {/* Sticky action bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-canvas/95 px-4 py-3 backdrop-blur md:pl-64">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-end gap-2">
          {editable ? (
            <>
              <span className="mr-auto font-body text-xs text-muted">
                {errorCount === 0 ? "Ready to activate" : `${errorCount} issue${errorCount === 1 ? "" : "s"} before activation`}
              </span>
              <button type="button" onClick={save} disabled={busy !== null} className={ghost}>
                {busy === "save" ? "Saving…" : "Save draft"}
              </button>
              <button
                type="button"
                onClick={activate}
                disabled={busy !== null || errorCount > 0}
                className="rounded-lg border border-success/50 bg-success/10 px-4 py-1.5 font-body text-xs font-bold text-success transition-colors hover:bg-success/20 disabled:opacity-40"
              >
                {busy === "activate" ? "Activating…" : "Activate"}
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => setDuplicating(true)} disabled={busy !== null} className={ghost}>
                Duplicate
              </button>
              {detail.isActive ? (
                <button type="button" onClick={archive} disabled={busy !== null} className={danger}>
                  {busy === "archive" ? "Archiving…" : "Archive"}
                </button>
              ) : (
                <button type="button" onClick={restore} disabled={busy !== null} className={ghost}>
                  {busy === "restore" ? "Restoring…" : "Restore"}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {duplicating ? (
        <DuplicateDialog
          source={detail}
          busy={busy === "duplicate"}
          onCancel={() => setDuplicating(false)}
          onConfirm={async (code, name) => {
            const d = await api(
              `/api/workflows/definitions/${detail.code}/duplicate`,
              { method: "POST", headers: json, body: JSON.stringify({ code, name }) },
              "duplicate",
            );
            if (d) router.push(`/workflow-builder/${d.code}`);
          }}
        />
      ) : null}
    </div>
  );
}

function GroupCard({
  index,
  group,
  total,
  options,
  onChange,
  onMove,
  onRemove,
}: {
  index: number;
  group: BuilderGroup;
  total: number;
  options: BuilderOptions;
  onChange: (patch: Partial<BuilderGroup>) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}) {
  function setApprover(ai: number, patch: Partial<BuilderApprover>) {
    onChange({ approvers: group.approvers.map((a, i) => (i === ai ? { ...a, ...patch } : a)) });
  }
  function moveApprover(ai: number, dir: -1 | 1) {
    const next = [...group.approvers];
    const j = ai + dir;
    if (j < 0 || j >= next.length) return;
    [next[ai], next[j]] = [next[j]!, next[ai]!];
    onChange({ approvers: next });
  }

  return (
    <div className="rounded-lg border border-line bg-card p-5">
      <div className="mb-4 flex items-center gap-2">
        <span className="font-body text-[11px] font-bold uppercase tracking-[0.14em] text-muted">Group {index + 1}</span>
        <div className="ml-auto flex gap-1">
          <IconBtn label="Move up" disabled={index === 0} onClick={() => onMove(-1)}>↑</IconBtn>
          <IconBtn label="Move down" disabled={index === total - 1} onClick={() => onMove(1)}>↓</IconBtn>
          <button type="button" onClick={onRemove} className={`${danger} px-2`} aria-label="Remove group">
            Remove
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Group name">
          <input className={input} value={group.name} onChange={(e) => onChange({ name: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Quorum">
            <input type="number" min={1} className={input} value={group.quorum} onChange={(e) => onChange({ quorum: toInt(e.target.value) ?? 1 })} />
          </Field>
          <Field label="On reject">
            <select className={input} value={group.rejectPolicy} onChange={(e) => onChange({ rejectPolicy: e.target.value as BuilderGroup["rejectPolicy"] })}>
              {REJECT_POLICIES.map((p) => (
                <option key={p} value={p}>
                  {p === "fail_fast" ? "Fail fast" : "Continue"}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </div>

      <ConditionEditor condition={group.condition} onChange={(c) => onChange({ condition: c })} />

      {/* SLA row */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Field label="SLA (h)"><NumberInput value={group.slaHours} onChange={(v) => onChange({ slaHours: v })} /></Field>
        <Field label="Warn (h)"><NumberInput value={group.warnHours} onChange={(v) => onChange({ warnHours: v })} /></Field>
        <Field label="Timeout (h)"><NumberInput value={group.timeoutHours} onChange={(v) => onChange({ timeoutHours: v })} /></Field>
        <Field label="On timeout">
          <select className={input} value={group.timeoutAction ?? ""} onChange={(e) => onChange({ timeoutAction: (e.target.value || null) as BuilderGroup["timeoutAction"] })}>
            <option value="">— none —</option>
            {TIMEOUT_ACTIONS.map((t) => (
              <option key={t} value={t}>
                {t.replace("_", " ")}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Remind (h)"><NumberInput value={group.reminderHours} onChange={(v) => onChange({ reminderHours: v })} /></Field>
      </div>

      {/* Approvers */}
      <div className="mt-5">
        <p className="mb-2 font-body text-[11px] font-bold uppercase tracking-[0.14em] text-muted">
          Approvers <span className="text-secondary">({group.approvers.length})</span>
          {group.approvers.length > 1 ? <span className="text-muted"> · parallel, quorum {group.quorum}</span> : null}
        </p>
        <div className="space-y-2">
          {group.approvers.map((a, ai) => (
            <ApproverRow
              key={ai}
              approver={a}
              options={options}
              onChange={(patch) => setApprover(ai, patch)}
              onMove={(dir) => moveApprover(ai, dir)}
              onRemove={() => onChange({ approvers: group.approvers.filter((_, i) => i !== ai) })}
              first={ai === 0}
              last={ai === group.approvers.length - 1}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={() =>
            onChange({
              approvers: [
                ...group.approvers,
                { approverType: "access_level", approverUserId: null, approverLevel: "L1", approverRef: null, approverHint: null, escalationType: null, escalationRef: null },
              ],
            })
          }
          className={`${ghost} mt-2`}
        >
          + Add approver
        </button>
      </div>
    </div>
  );
}

function ApproverRow({
  approver,
  options,
  onChange,
  onMove,
  onRemove,
  first,
  last,
}: {
  approver: BuilderApprover;
  options: BuilderOptions;
  onChange: (patch: Partial<BuilderApprover>) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
  first: boolean;
  last: boolean;
}) {
  return (
    <div className="rounded-lg border border-line bg-canvas p-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Field label="Type">
          <select className={input} value={approver.approverType} onChange={(e) => onChange({ approverType: e.target.value as BuilderApprover["approverType"] })}>
            {APPROVER_TYPES.map((t) => (
              <option key={t} value={t}>
                {t.replace("_", " ")}
              </option>
            ))}
          </select>
        </Field>
        <div className="sm:col-span-2">
          <Field label="Who">
            {approver.approverType === "user" ? (
              <select className={input} value={approver.approverUserId ?? ""} onChange={(e) => onChange({ approverUserId: e.target.value || null })}>
                <option value="">— choose a user —</option>
                {options.users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.fullName}
                  </option>
                ))}
              </select>
            ) : approver.approverType === "access_level" ? (
              <select className={input} value={approver.approverLevel ?? ""} onChange={(e) => onChange({ approverLevel: (e.target.value || null) as BuilderApprover["approverLevel"] })}>
                <option value="">— choose a level —</option>
                {ACCESS_LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            ) : (
              <input
                className={input}
                placeholder={approver.approverType === "role" ? "role code" : "resolver key"}
                value={approver.approverRef ?? ""}
                onChange={(e) => onChange({ approverRef: e.target.value || null })}
              />
            )}
          </Field>
        </div>
      </div>

      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Field label="Label (optional)">
          <input className={input} value={approver.approverHint ?? ""} onChange={(e) => onChange({ approverHint: e.target.value || null })} />
        </Field>
        <Field label="Escalate to (type)">
          <select className={input} value={approver.escalationType ?? ""} onChange={(e) => onChange({ escalationType: (e.target.value || null) as BuilderApprover["escalationType"] })}>
            <option value="">— none —</option>
            {APPROVER_TYPES.map((t) => (
              <option key={t} value={t}>
                {t.replace("_", " ")}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Escalation target">
          <input
            className={input}
            disabled={!approver.escalationType}
            placeholder={approver.escalationType ? "user email/id, level, or key" : "—"}
            value={approver.escalationRef ?? ""}
            onChange={(e) => onChange({ escalationRef: e.target.value || null })}
          />
        </Field>
      </div>

      <div className="mt-2 flex justify-end gap-1">
        <IconBtn label="Move up" disabled={first} onClick={() => onMove(-1)}>↑</IconBtn>
        <IconBtn label="Move down" disabled={last} onClick={() => onMove(1)}>↓</IconBtn>
        <button type="button" onClick={onRemove} className={`${danger} px-2`} aria-label="Remove approver">
          Remove
        </button>
      </div>
    </div>
  );
}

function ConditionEditor({ condition, onChange }: { condition: unknown | null; onChange: (c: unknown | null) => void }) {
  const simple = asSimpleRule(condition);
  const on = condition != null;
  const advanced = on && !simple;

  return (
    <div className="mt-4 rounded-lg border border-line bg-canvas p-3">
      <label className="flex items-center gap-2 font-body text-sm text-secondary">
        <input
          type="checkbox"
          checked={on}
          onChange={(e) => onChange(e.target.checked ? { field: "", op: ">", value: "" } : null)}
        />
        Run this group conditionally
      </label>

      {advanced ? (
        <div className="mt-2">
          <p className="font-body text-xs text-muted">Advanced condition (kept as-is): {describeCondition(condition) ?? "custom rule"}</p>
          <button type="button" className={`${ghost} mt-2`} onClick={() => onChange({ field: "", op: ">", value: "" })}>
            Replace with a simple rule
          </button>
        </div>
      ) : on && simple ? (
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <input className={input} placeholder="field (e.g. amount)" value={simple.field} onChange={(e) => onChange({ ...simple, field: e.target.value })} />
          <select className={input} value={simple.op} onChange={(e) => onChange({ ...simple, op: e.target.value })}>
            {OPERATORS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
          <input className={input} placeholder="value (e.g. 50000000)" value={String(simple.value ?? "")} onChange={(e) => onChange({ ...simple, value: parseValue(e.target.value) })} />
        </div>
      ) : null}
    </div>
  );
}

function ValidationPanel({ issues }: { issues: ValidationIssue[] }) {
  if (issues.length === 0) {
    return (
      <div className="mb-6 rounded-lg border border-success/40 bg-success/5 px-4 py-2.5 font-body text-sm text-success">
        Valid — this workflow can be activated.
      </div>
    );
  }
  return (
    <div className="mb-6 rounded-lg border border-line bg-card p-4">
      <p className="mb-2 font-body text-[11px] font-bold uppercase tracking-[0.14em] text-muted">Validation</p>
      <ul className="space-y-1">
        {issues.map((iss, i) => (
          <li key={i} className={`font-body text-sm ${iss.level === "error" ? "text-error" : "text-warning"}`}>
            {iss.level === "error" ? "✕" : "!"} {iss.group != null ? `Group ${iss.group}: ` : ""}
            {iss.message}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ReadOnlyGroup({ index, group, options }: { index: number; group: BuilderGroup; options: BuilderOptions }) {
  return (
    <div className="rounded-lg border border-line bg-card p-5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-body text-[15px] font-bold text-white">
          <span className="text-muted">{index + 1}.</span> {group.name}
        </h3>
        <span className="font-body text-xs text-muted">
          {group.approvers.length > 1 ? `Parallel · quorum ${group.quorum}` : "Single approver"}
        </span>
      </div>
      {group.condition != null ? (
        <p className="mt-1 font-body text-xs text-warning">Runs when: {describeCondition(group.condition) ?? "a custom rule"}</p>
      ) : null}
      <ul className="mt-3 space-y-1">
        {group.approvers.map((a, i) => (
          <li key={i} className="font-body text-sm font-light text-secondary">
            • {approverLabel(a, options)}
          </li>
        ))}
      </ul>
      {group.slaHours || group.timeoutHours ? (
        <p className="mt-3 font-body text-xs text-muted">
          {group.slaHours ? `SLA ${group.slaHours}h` : ""}
          {group.warnHours ? ` · warn ${group.warnHours}h` : ""}
          {group.timeoutHours ? ` · timeout ${group.timeoutHours}h → ${group.timeoutAction ?? "?"}` : ""}
        </p>
      ) : null}
    </div>
  );
}

function DuplicateDialog({
  source,
  busy,
  onCancel,
  onConfirm,
}: {
  source: WorkflowDefinitionDetail;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (code: string, name: string) => void;
}) {
  const [code, setCode] = useState(`${source.code}_v2`);
  const [name, setName] = useState(`${source.name} (copy)`);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <button type="button" aria-label="Cancel" onClick={onCancel} className="absolute inset-0 bg-black/70" />
      <div className="relative w-full max-w-md rounded-lg border border-line bg-card p-6">
        <h3 className="font-heading text-2xl text-white">Duplicate workflow</h3>
        <p className="mt-1 font-body text-sm font-light text-muted">
          Copies every group and approver. The copy is created inactive so you can edit it safely.
        </p>
        <label className="mt-5 block">
          <span className="mb-1 block font-body text-xs font-bold text-secondary">New code</span>
          <input autoFocus value={code} onChange={(e) => setCode(e.target.value)} className={input} placeholder="lower_case_code" />
        </label>
        <label className="mt-3 block">
          <span className="mb-1 block font-body text-xs font-bold text-secondary">New name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className={input} />
        </label>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className={ghost}>
            Cancel
          </button>
          <button type="button" disabled={busy || !code.trim() || !name.trim()} onClick={() => onConfirm(code.trim(), name.trim())} className={ghost}>
            {busy ? "Copying…" : "Duplicate"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---- small pieces + helpers ---- */

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={`block ${className ?? ""}`}>
      <span className="mb-1 block font-body text-[11px] font-bold uppercase tracking-[0.1em] text-muted">{label}</span>
      {children}
    </label>
  );
}

function NumberInput({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  return <input type="number" min={1} className={input} value={value ?? ""} onChange={(e) => onChange(toInt(e.target.value))} />;
}

function IconBtn({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} disabled={disabled} onClick={onClick} className="rounded border border-line-strong px-2 py-1 font-body text-xs font-bold text-white transition-colors hover:bg-hover disabled:opacity-30">
      {children}
    </button>
  );
}

function StatusBadge({ isActive, runningCount }: { isActive: boolean; runningCount: number }) {
  const cls = isActive ? "bg-success/10 text-success" : runningCount > 0 ? "bg-warning/10 text-warning" : "bg-white/5 text-muted";
  const label = isActive ? "Active" : runningCount > 0 ? "Archived · running" : "Draft";
  return <span className={`inline-block rounded-full px-2 py-0.5 font-body text-[10px] font-bold uppercase tracking-wide ${cls}`}>{label}</span>;
}

function stripApprover(a: BuilderApprover): BuilderApprover {
  return {
    approverType: a.approverType,
    approverUserId: a.approverUserId,
    approverLevel: a.approverLevel,
    approverRef: a.approverRef,
    approverHint: a.approverHint,
    escalationType: a.escalationType,
    escalationRef: a.escalationRef,
    approverName: a.approverName ?? null,
  };
}

function approverLabel(a: BuilderApprover, options: BuilderOptions): string {
  const base =
    a.approverType === "user"
      ? a.approverName ?? options.users.find((u) => u.id === a.approverUserId)?.fullName ?? "a user"
      : a.approverType === "access_level"
        ? `Any ${a.approverLevel ?? "?"}`
        : `${a.approverType}: ${a.approverRef ?? "?"}`;
  return a.approverHint ? `${base} (${a.approverHint})` : base;
}

type SimpleRule = { field: string; op: string; value: unknown };
function asSimpleRule(condition: unknown | null): SimpleRule | null {
  if (!condition || typeof condition !== "object" || Array.isArray(condition)) return null;
  const c = condition as Record<string, unknown>;
  if ("field" in c && "op" in c && "value" in c && typeof c.field === "string" && typeof c.op === "string") {
    return { field: c.field, op: c.op, value: c.value };
  }
  return null;
}

function parseValue(raw: string): unknown {
  if (raw.trim() === "") return "";
  if (/^-?\d+(\.\d+)?$/.test(raw.trim())) return Number(raw);
  if (raw === "true") return true;
  if (raw === "false") return false;
  return raw;
}

function toInt(raw: string): number | null {
  if (raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

const json = { "Content-Type": "application/json" };
const input = "w-full rounded border border-line-strong bg-card px-3 py-2 font-body text-sm text-white focus:border-white focus:outline-none disabled:opacity-60";
const ghost = "rounded-lg border border-line-strong px-3 py-1.5 font-body text-xs font-bold text-white transition-colors hover:bg-hover disabled:opacity-40";
const danger = "rounded-lg border border-error/40 px-3 py-1.5 font-body text-xs font-bold text-error transition-colors hover:bg-error/5 disabled:opacity-40";
