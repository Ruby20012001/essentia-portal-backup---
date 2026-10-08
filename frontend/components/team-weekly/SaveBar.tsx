"use client";

/**
 * Save, for the Team Weekly and 3D boards.
 *
 * Every add, move and remove is already written the moment it is made — there
 * is no unsaved state to lose. So the line beside the buttons says that, and
 * the buttons do the two things "save" can still mean:
 *
 *   Excel file  the rows on screen as a .csv, which Excel opens directly
 *               (Monica, 8 Oct: "file").
 *   PDF         WIO's "Save this view": the browser's own Save as PDF, laid
 *               out for paper by the #print-area rules in globals.css.
 */

export type SheetRow = Record<string, string | number | null>;

function csvCell(v: string | number | null): string {
  const s = v === null ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Download rows as a CSV file. The BOM makes Excel read it as UTF-8 (₹, –, Hindi names). */
export function downloadSheet(filename: string, rows: SheetRow[], headers: string[]): void {
  const lines = [headers.map(csvCell).join(","), ...rows.map((r) => headers.map((h) => csvCell(r[h] ?? null)).join(","))];
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function SaveBar({ saving, onFile }: { saving: boolean; onFile?: () => void }) {
  return (
    <span className="flex flex-wrap items-center gap-2" data-print="hide">
      <span
        role="status"
        className={`mr-1 font-body text-xs ${saving ? "font-light text-muted" : "font-bold text-forest"}`}
      >
        {saving ? "Saving…" : "✓ All changes saved"}
      </span>
      {onFile ? (
        <button
          type="button"
          onClick={onFile}
          title="Download this list as an Excel file"
          className="rounded bg-ink px-4 py-1.5 font-body text-xs font-bold uppercase tracking-[0.12em] text-canvas transition-opacity hover:opacity-90"
        >
          Save file
        </button>
      ) : null}
      <button
        type="button"
        onClick={() => window.print()}
        title="Save this view as a PDF"
        className="rounded border border-line-strong bg-canvas px-3 py-1.5 font-body text-xs font-bold uppercase tracking-[0.12em] text-secondary transition-colors hover:bg-hover hover:text-ink"
      >
        PDF
      </button>
    </span>
  );
}
