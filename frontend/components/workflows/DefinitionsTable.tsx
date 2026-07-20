"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { WorkflowDefinitionRow } from "@/lib/services/workflow-definitions";

type Banner = { tone: "error" | "success"; message: string };

/**
 * Workflow Definitions list (screen 6). Archive stops NEW instances only —
 * running work is untouched — so the row shows the live count and the confirm
 * says exactly what will and will not happen. Refusals surface verbatim.
 */
export function DefinitionsTable({ initial }: { initial: WorkflowDefinitionRow[] }) {
  const router = useRouter();
  const [banner, setBanner] = useState<Banner | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [duplicating, setDuplicating] = useState<WorkflowDefinitionRow | null>(null);

  async function call(code: string, path: string, init: RequestInit) {
    setBusy(code);
    setBanner(null);
    try {
      const res = await fetch(path, init);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setBanner({ tone: "error", message: data.error ?? `Request failed (${res.status})` });
        return null;
      }
      router.refresh();
      return data;
    } finally {
      setBusy(null);
    }
  }

  async function archive(d: WorkflowDefinitionRow) {
    const data = await call(d.code, `/api/workflows/definitions/${d.code}/archive`, { method: "POST" });
    if (data) {
      setBanner({
        tone: "success",
        message:
          `${d.name} archived — no new workflows can start.` +
          (data.runningCount > 0
            ? ` ${data.runningCount} running instance${data.runningCount === 1 ? "" : "s"} continue unaffected.`
            : ""),
      });
    }
  }

  async function restore(d: WorkflowDefinitionRow) {
    const data = await call(d.code, `/api/workflows/definitions/${d.code}/archive`, { method: "DELETE" });
    if (data) setBanner({ tone: "success", message: `${d.name} restored — it can be started again.` });
  }

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

      {initial.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line-strong bg-card px-5 py-12 text-center font-body text-sm font-light text-muted">
          No workflow definitions yet.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full text-left font-body text-[13.5px]">
            <thead>
              <tr className="bg-surface text-[11px] uppercase tracking-[0.12em] text-secondary">
                <th className="px-4 py-2.5 font-bold">Name</th>
                <th className="px-4 py-2.5 font-bold">Module</th>
                <th className="px-4 py-2.5 font-bold">Groups</th>
                <th className="px-4 py-2.5 font-bold">Status</th>
                <th className="px-4 py-2.5 font-bold">Last updated</th>
                <th className="px-4 py-2.5 text-right font-bold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {initial.map((d) => (
                <tr key={d.code} className="border-t border-line bg-card align-top transition-colors hover:bg-hover">
                  <td className="px-4 py-2.5">
                    <span className="block font-bold text-white">{d.name}</span>
                    <span className="block font-body text-xs font-light text-muted">{d.code}</span>
                  </td>
                  <td className="px-4 py-2.5 font-light text-secondary">{d.resourceType ?? "—"}</td>
                  <td className="px-4 py-2.5 font-light text-secondary">
                    {d.groupCount}
                    <span className="text-muted"> · {d.approverCount} approvers</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`rounded-full px-2 py-0.5 font-body text-[10px] font-bold uppercase tracking-wide ${
                        d.isActive ? "bg-success/10 text-success" : "bg-white/5 text-muted"
                      }`}
                    >
                      {d.isActive ? "Active" : "Archived"}
                    </span>
                    {d.runningCount > 0 ? (
                      <span className="mt-1 block font-body text-xs text-muted">{d.runningCount} running</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-2.5 font-light text-muted">
                    {(d.updatedAt ?? d.createdAt).slice(0, 10)}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap justify-end gap-2">
                      <a href={`/workflow-builder/${d.code}`} className={ghost}>
                        Edit
                      </a>
                      <button type="button" className={ghost} disabled={busy === d.code} onClick={() => setDuplicating(d)}>
                        Duplicate
                      </button>
                      {d.isActive ? (
                        <button
                          type="button"
                          className="rounded-lg border border-error/40 px-3 py-1.5 font-body text-xs font-bold text-error transition-colors hover:bg-error/5 disabled:opacity-40"
                          disabled={busy === d.code}
                          onClick={() => archive(d)}
                        >
                          Archive
                        </button>
                      ) : (
                        <button type="button" className={ghost} disabled={busy === d.code} onClick={() => restore(d)}>
                          Restore
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {duplicating ? (
        <DuplicateDialog
          source={duplicating}
          busy={busy === duplicating.code}
          onCancel={() => setDuplicating(null)}
          onConfirm={async (code, name) => {
            const data = await call(duplicating.code, `/api/workflows/definitions/${duplicating.code}/duplicate`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ code, name }),
            });
            if (data) {
              setDuplicating(null);
              setBanner({
                tone: "success",
                message: `Copied to ${data.code} — ${data.groupsCopied} groups, ${data.approversCopied} approvers. The copy is archived until you activate it.`,
              });
            }
          }}
        />
      ) : null}
    </div>
  );
}

const ghost =
  "rounded-lg border border-line-strong px-3 py-1.5 font-body text-xs font-bold text-white transition-colors hover:bg-hover disabled:opacity-40";

function DuplicateDialog({
  source,
  busy,
  onCancel,
  onConfirm,
}: {
  source: WorkflowDefinitionRow;
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
          Copies every group and approver from <span className="text-secondary">{source.name}</span>. The copy is
          created archived, so it cannot be started until you activate it.
        </p>

        <label className="mt-5 block">
          <span className="mb-1 block font-body text-xs font-bold text-secondary">New code</span>
          <input
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className={field}
            placeholder="lower_case_code"
          />
        </label>
        <label className="mt-3 block">
          <span className="mb-1 block font-body text-xs font-bold text-secondary">New name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className={field} />
        </label>

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className={ghost}>
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || !code.trim() || !name.trim()}
            onClick={() => onConfirm(code.trim(), name.trim())}
            className="rounded-lg border border-line-strong bg-canvas px-4 py-1.5 font-body text-xs font-bold text-white transition-colors hover:bg-hover disabled:opacity-40"
          >
            {busy ? "Copying…" : "Duplicate"}
          </button>
        </div>
      </div>
    </div>
  );
}

const field =
  "w-full rounded border border-line-strong bg-card px-3 py-2 font-body text-sm text-white focus:border-white focus:outline-none";
