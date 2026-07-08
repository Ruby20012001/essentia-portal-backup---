"use client";

import { useState } from "react";
import type { ProjectOption } from "@/lib/services/projects";

/** New-WIO form. Routing is validated against the Department Master. */
export function CreateWioPanel({
  projects,
  wioDepartments,
  departmentNames,
  busy,
  onCreate,
}: {
  projects: ProjectOption[];
  wioDepartments: string[];
  departmentNames: Record<string, string>;
  busy: boolean;
  onCreate: (input: {
    projectId: string;
    departmentCode: string;
    notes?: string;
  }) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [projectId, setProjectId] = useState("");
  const [departmentCode, setDepartmentCode] = useState("");
  const [notes, setNotes] = useState("");

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded bg-espresso px-5 py-2.5 font-body text-sm font-bold text-cream transition-opacity hover:opacity-90"
      >
        + New WIO
      </button>
    );
  }

  const selectClass =
    "w-full rounded border border-line-strong bg-white px-3 py-2 font-body text-sm text-ink";

  return (
    <form
      className="w-full max-w-xl rounded-lg border border-line bg-paper p-5"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!projectId || !departmentCode) return;
        const created = await onCreate({
          projectId,
          departmentCode,
          notes: notes.trim() || undefined,
        });
        if (created) {
          setOpen(false);
          setProjectId("");
          setDepartmentCode("");
          setNotes("");
        }
      }}
    >
      <p className="mb-3 font-body text-[11px] font-bold uppercase tracking-[0.16em] text-label">
        New Work Initiation Order
      </p>
      <div className="mb-3 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block font-body text-xs font-bold text-label">
            Project
          </span>
          <select
            required
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className={selectClass}
          >
            <option value="">Select project…</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.projectCode}
                {p.projectName ? ` — ${p.projectName}` : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block font-body text-xs font-bold text-label">
            Department (Brief §30)
          </span>
          <select
            required
            value={departmentCode}
            onChange={(e) => setDepartmentCode(e.target.value)}
            className={selectClass}
          >
            <option value="">Select department…</option>
            {wioDepartments.map((code) => (
              <option key={code} value={code}>
                {departmentNames[code] ?? code}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="mb-4 block">
        <span className="mb-1 block font-body text-xs font-bold text-label">
          Notes (optional)
        </span>
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={2000}
          className={selectClass}
          placeholder="Scope note for the receiving department"
        />
      </label>
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={busy || !projectId || !departmentCode}
          className="rounded bg-espresso px-5 py-2 font-body text-sm font-bold text-cream transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Creating…" : "Create WIO"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded border border-line-strong px-5 py-2 font-body text-sm font-bold text-label hover:text-ink"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
