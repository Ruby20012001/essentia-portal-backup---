"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { BuilderOptions } from "@/lib/services/workflow-builder";

/**
 * New workflow definition — a small create form. Creates a DRAFT (inactive, no
 * groups) via POST /api/workflows/definitions, then hands off to the builder to
 * add the chain. Consumes existing services only.
 */
export function NewDefinitionForm({ options }: { options: BuilderOptions }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [resourceType, setResourceType] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const codeOk = /^[a-z0-9_]{3,50}$/.test(code.trim());

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/workflows/definitions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: code.trim(),
          name: name.trim(),
          resourceType: resourceType || null,
          description: description.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? `Failed (${res.status})`);
        return;
      }
      router.push(`/workflow-builder/${data.code}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-lg">
      {error ? (
        <div role="alert" className="mb-5 rounded-lg border-l-4 border-error bg-error/5 px-5 py-3 font-body text-sm font-bold text-error">
          {error}
        </div>
      ) : null}

      <div className="space-y-4 rounded-lg border border-line bg-card p-5">
        <label className="block">
          <span className="mb-1 block font-body text-[11px] font-bold uppercase tracking-[0.1em] text-muted">Code</span>
          <input className={input} value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. capex_approval" />
          <span className={`mt-1 block font-body text-xs ${code && !codeOk ? "text-error" : "text-muted"}`}>
            3–50 chars · lower-case letters, numbers, underscores. Cannot be changed later.
          </span>
        </label>
        <label className="block">
          <span className="mb-1 block font-body text-[11px] font-bold uppercase tracking-[0.1em] text-muted">Name</span>
          <input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Capex Approval" />
        </label>
        <label className="block">
          <span className="mb-1 block font-body text-[11px] font-bold uppercase tracking-[0.1em] text-muted">Module (optional)</span>
          <select className={input} value={resourceType} onChange={(e) => setResourceType(e.target.value)}>
            <option value="">— none —</option>
            {options.resourceTypes.map((r) => (
              <option key={r.code} value={r.code}>
                {r.name} ({r.code})
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block font-body text-[11px] font-bold uppercase tracking-[0.1em] text-muted">Description (optional)</span>
          <textarea className={`${input} min-h-[64px]`} value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={create}
            disabled={busy || !codeOk || !name.trim()}
            className="rounded-lg border border-line-strong bg-canvas px-4 py-2 font-body text-xs font-bold text-white transition-colors hover:bg-hover disabled:opacity-40"
          >
            {busy ? "Creating…" : "Create draft & open builder"}
          </button>
        </div>
      </div>
    </div>
  );
}

const input = "w-full rounded border border-line-strong bg-card px-3 py-2 font-body text-sm text-white focus:border-white focus:outline-none";
