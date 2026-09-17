"use client";

import { useState } from "react";
import { inputClass, labelClass } from "@/components/design-tracker/HeatPill";
import type { DesignBoard } from "@/lib/services/design-tracker";

/**
 * Screen 4 — Setup. Vishakha's (and L0/L1's) only.
 *
 * The board reads against today's date in India unless somebody pins a date —
 * useful for a review "as of Friday". The chart below is the activity chart
 * itself: the day each activity is due by, how long it takes, and whom it
 * depends on. Change it here and every project re-reads against it.
 */
export function DesignSetupView({
  board,
  busyId,
  onSettings,
  onActivity,
}: {
  board: DesignBoard;
  busyId: string | null;
  onSettings: (patch: Record<string, unknown>) => void;
  onActivity: (id: string, patch: Record<string, unknown>) => void;
}) {
  const { settings, activities } = board;
  const [pin, setPin] = useState(settings.today);
  const busy = busyId === "settings";

  return (
    <div className="max-w-6xl">
      <section className="mb-8 rounded-lg border border-line bg-card px-5 py-4">
        <h2 className="mb-1 font-heading text-2xl text-white">The date this board is read against</h2>
        <p className="mb-4 max-w-3xl font-body text-sm font-light text-muted">
          {settings.pinned
            ? `Pinned to ${settings.today}. Every colour on the board is measured from that day until the pin is removed.`
            : "Today, in India. Pin a date to read the board as of a particular day — for a review, say."}
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className={labelClass}>Date</span>
            <input type="date" value={pin} onChange={(e) => setPin(e.target.value)} className={inputClass} />
          </label>
          <button
            type="button"
            // Pinning to the day it already reads would look like nothing
            // happened today and silently freeze the board from tomorrow.
            disabled={busy || pin === settings.today || pin === ""}
            onClick={() => onSettings({ today: pin })}
            className="rounded bg-forest px-4 py-1.5 font-body text-xs font-bold text-white transition-colors hover:bg-forest/90 disabled:opacity-50"
          >
            Pin the board to this date
          </button>
          {settings.pinned ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => onSettings({ today: null })}
              className="rounded border border-line-strong bg-canvas px-4 py-1.5 font-body text-xs font-bold text-secondary transition-colors hover:bg-hover disabled:opacity-50"
            >
              Follow the calendar
            </button>
          ) : null}
        </div>
      </section>

      <section className="mb-8 grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-line bg-card px-5 py-4">
          <span className={labelClass}>Warm within</span>
          <div className="flex items-baseline gap-2">
            <NumberInput
              value={settings.warmWithin}
              disabled={busy}
              onCommit={(v) => v !== null && onSettings({ warmWithin: v })}
            />
            <span className="font-body text-sm font-light text-muted">days of the due day</span>
          </div>
          <p className="mt-2 font-body text-xs font-light text-muted">
            An activity due within this many days turns its project orange. Past the due day it is red.
          </p>
        </div>
      </section>

      <section>
        <h2 className="mb-1 font-heading text-2xl text-white">The activity chart</h2>
        <p className="mb-3 max-w-3xl font-body text-sm font-light text-muted">
          From &ldquo;1.)DESIGN ACTIVITY CHART.xlsx&rdquo;. <em>Due by day</em> counts from the project start (the
          chart&rsquo;s standard time consumed); <em>days</em> is how long the activity takes; <em>depends on</em> is
          the responsibility — the name a delay is put against.
        </p>
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full text-left font-body text-[13.5px]">
            <thead>
              <tr className="bg-surface text-[11px] uppercase tracking-[0.12em] text-secondary">
                <th className="px-3 py-2.5 font-bold">#</th>
                <th className="px-3 py-2.5 font-bold">Activity</th>
                <th className="px-3 py-2.5 font-bold">Due by day</th>
                <th className="px-3 py-2.5 font-bold">Days</th>
                <th className="px-3 py-2.5 font-bold">Depends on</th>
                <th className="px-3 py-2.5 font-bold">Client</th>
                <th className="px-3 py-2.5 font-bold">Late now</th>
              </tr>
            </thead>
            <tbody>
              {activities.map((a) => {
                const lateNow = board.projects.filter((p) => p.late.some((l) => l.id === a.id)).length;
                const rowBusy = busyId === a.id;
                return (
                  <tr key={a.id} className="border-t border-line bg-card align-top transition-colors hover:bg-hover">
                    <td className="whitespace-nowrap px-3 py-2.5 font-light text-muted">{a.code}</td>
                    <td className="px-3 py-2.5 text-ink">
                      <span className="font-bold">{a.task}</span>
                      <span className="block text-[11px] font-light text-muted">
                        {[a.phase, a.optional ? "can be N/A" : null].filter(Boolean).join(" · ")}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <NumberInput value={a.dueDay} disabled={rowBusy} onCommit={(v) => onActivity(a.id, { dueDay: v })} />
                    </td>
                    <td className="px-3 py-2.5">
                      <NumberInput
                        value={a.standardDays}
                        disabled={rowBusy}
                        onCommit={(v) => onActivity(a.id, { standardDays: v })}
                      />
                    </td>
                    <td className="min-w-[14rem] px-3 py-2.5">
                      <TextInput value={a.dependsOn} disabled={rowBusy} onCommit={(v) => onActivity(a.id, { dependsOn: v })} />
                    </td>
                    <td className="px-3 py-2.5">
                      <input
                        type="checkbox"
                        checked={a.dependsOnClient}
                        disabled={rowBusy}
                        onChange={(e) => onActivity(a.id, { dependsOnClient: e.target.checked })}
                        className="h-4 w-4 accent-amber-deep"
                        aria-label={`${a.task} depends on the client`}
                      />
                    </td>
                    <td className="px-3 py-2.5 font-light text-secondary">
                      {lateNow === 0 ? <span className="text-muted">none</span> : <span className="font-bold text-alert">{lateNow}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function NumberInput({
  value,
  disabled,
  onCommit,
}: {
  value: number | null;
  disabled: boolean;
  onCommit: (value: number | null) => void;
}) {
  const shown = value === null ? "" : String(value);
  const [draft, setDraft] = useState(shown);
  return (
    <input
      type="number"
      min={0}
      value={draft}
      disabled={disabled}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft === shown) return;
        if (draft.trim() === "") return onCommit(null);
        const parsed = Number(draft);
        if (Number.isInteger(parsed) && parsed >= 0) onCommit(parsed);
        else setDraft(shown);
      }}
      className="w-20 rounded border border-line-strong bg-canvas px-2.5 py-1.5 font-body text-[13px] font-light text-ink focus:border-amber-deep focus:outline-none disabled:opacity-50"
    />
  );
}

function TextInput({ value, disabled, onCommit }: { value: string; disabled: boolean; onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  return (
    <input
      value={draft}
      disabled={disabled}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const next = draft.trim();
        if (next !== "" && next !== value) onCommit(next);
        else setDraft(value);
      }}
      className={inputClass}
    />
  );
}
