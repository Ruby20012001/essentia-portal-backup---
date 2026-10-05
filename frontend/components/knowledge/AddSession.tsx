"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CONTENT_TYPES } from "@/lib/services/knowledge-logic";

/**
 * Add a Wednesday Year session. Collapsed until asked for, so the library
 * opens on reading, not on a form. Saves through POST /api/knowledge, then
 * refreshes the server-rendered list.
 */
export function AddSession({ tracks }: { tracks: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            setDone(null);
          }}
          className="rounded-md border border-brand bg-brand/10 px-4 py-2 font-body text-sm text-white hover:bg-brand/20"
        >
          Add a session
        </button>
        {done ? <span className="font-body text-sm text-success">Added “{done}”.</span> : null}
      </div>
    );
  }

  const input =
    "w-full rounded-md border border-line bg-surface px-3 py-2 font-body text-sm text-white placeholder:text-muted focus:border-brand focus:outline-none";
  const label = "flex flex-col gap-1 font-body text-xs text-secondary";

  return (
    <form
      className="grid grid-cols-1 gap-4 rounded-lg border border-line bg-card p-5 sm:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        const body = Object.fromEntries(form.entries());
        setBusy(true);
        setError(null);
        try {
          const res = await fetch("/api/knowledge", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...body, sessionDate: body.sessionDate || null, year: null }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            setError(data.error ?? "The session could not be saved. Please try again.");
            return;
          }
          setDone(String(body.title));
          setOpen(false);
          router.refresh();
        } catch {
          setError("The session could not be saved. Please try again.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className={`${label} sm:col-span-2`}>
        Title
        <input name="title" required minLength={3} maxLength={300} className={input} placeholder="e.g. Module 7: Wood behaviour in monsoon conditions" />
      </label>
      <label className={label}>
        Track
        <select name="track" required className={input} defaultValue={tracks[0]}>
          {tracks.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </label>
      <label className={label}>
        Type
        <select name="contentType" required className={input} defaultValue="craft_wednesday">
          {CONTENT_TYPES.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </select>
      </label>
      <label className={`${label} sm:col-span-2`}>
        Session notes
        <textarea
          name="content"
          required
          minLength={20}
          rows={6}
          className={input}
          placeholder="Key points covered: what to check, common failure points, and what to specify."
        />
      </label>
      <label className={label}>
        Relevant roles <span className="text-muted">(comma separated)</span>
        <input name="roleTags" className={input} placeholder="Site supervisor, PMC" />
      </label>
      <label className={label}>
        Topics
        <input name="topicTags" className={input} placeholder="Carpentry, monsoon, joinery" />
      </label>
      <label className={label}>
        Project types
        <input name="projectTypeTags" className={input} placeholder="Residence, villa" />
      </label>
      <label className={label}>
        Session date
        <input name="sessionDate" type="date" className={input} />
      </label>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-brand px-4 py-2 font-body text-sm font-bold text-brand-ink disabled:opacity-60"
        >
          {busy ? "Saving…" : "Save session"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="font-body text-sm text-secondary hover:underline">
          Cancel
        </button>
        {error ? <span className="font-body text-sm text-error">{error}</span> : null}
      </div>
    </form>
  );
}
