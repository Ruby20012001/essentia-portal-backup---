"use client";

import { useState } from "react";
import type { TrackerBoard } from "@/lib/services/wio-tracker";

/**
 * Screen 4 — Setup.
 *
 * THE DATE STAMP is the control that matters here. It is one shared row, not
 * a per-browser value and not the wall clock: the team stamps the day, and
 * every person — and every screenshot, taken at any hour — reads the same
 * board. That property is the reason this tool left the spreadsheet, so the
 * screen says so rather than presenting the field as an ordinary setting.
 *
 * The chain below is editable because the team retunes it. `done_by` is
 * validated server-side against the window: a stage that must clear 20 days
 * before a 15-day deadline would paint every row LATE HERE forever, and the
 * API refuses it with that sentence rather than accepting a broken board.
 */
export function SetupView({
  board,
  busyId,
  onSettings,
  onStage,
}: {
  board: TrackerBoard;
  busyId: string | null;
  onSettings: (patch: Record<string, unknown>) => void;
  onStage: (id: string, patch: Record<string, unknown>) => void;
}) {
  const { settings, stages, can } = board;
  const [today, setToday] = useState(settings.today);
  const editable = can.edit;

  return (
    <div className="max-w-5xl">
      <section className="mb-8 rounded-lg border border-line bg-card px-5 py-4">
        <h2 className="mb-1 font-heading text-2xl text-white">The date this board is read against</h2>
        <p className="mb-4 max-w-3xl font-body text-sm font-light text-muted">
          Every number on the board — days left, days here, late, overdue — is
          measured from this date. It is stamped by the team, not taken from the
          clock, and it is shared: one value for everyone, so nobody disagrees
          about what is overdue and a screenshot taken at 11pm still reads the
          same as one taken at 9am.
        </p>

        <div className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="mb-1 block font-body text-[11px] font-light uppercase tracking-[0.14em] text-muted">
              Stamped date
            </span>
            <input
              type="date"
              value={today}
              disabled={!editable}
              onChange={(e) => setToday(e.target.value)}
              className="rounded border border-line-strong bg-canvas px-2.5 py-1.5 font-body text-[13px] font-light text-ink focus:border-amber-deep focus:outline-none disabled:opacity-50"
            />
          </label>
          {editable ? (
            <>
              <button
                type="button"
                disabled={busyId === "settings" || today === settings.today}
                onClick={() => onSettings({ today })}
                className="rounded bg-forest px-4 py-1.5 font-body text-xs font-bold text-white transition-colors hover:bg-forest/90 disabled:opacity-50"
              >
                {busyId === "settings" ? "Stamping…" : "Stamp the board"}
              </button>
              <button
                type="button"
                disabled={busyId === "settings"}
                onClick={() => {
                  const now = new Date().toISOString().slice(0, 10);
                  setToday(now);
                  onSettings({ today: now });
                }}
                className="rounded border border-line-strong bg-canvas px-4 py-1.5 font-body text-xs font-bold text-secondary transition-colors hover:bg-hover disabled:opacity-50"
              >
                Stamp today
              </button>
            </>
          ) : null}
          <p className="ml-auto font-body text-xs font-light text-muted">
            {settings.stampedBy
              ? `Last stamped by ${settings.stampedBy}${
                  settings.stampedAt ? ` · ${settings.stampedAt.slice(0, 16).replace("T", " ")}` : ""
                }`
              : "Carried over from the original workbook — never re-stamped in the portal"}
          </p>
        </div>
      </section>

      <section className="mb-8 grid gap-4 md:grid-cols-2">
        <NumberSetting
          label="WIO → PIO window"
          suffix="calendar days"
          value={settings.windowDays}
          disabled={!editable || busyId === "settings"}
          help="Brief §30. The PIO-due date is the WIO issue date plus this many days."
          onCommit={(v) => onSettings({ windowDays: v })}
        />
        <NumberSetting
          label="At risk from"
          suffix="days left"
          value={settings.atRiskFrom}
          disabled={!editable || busyId === "settings"}
          help="A running WIO reads At risk once this many days or fewer remain."
          onCommit={(v) => onSettings({ atRiskFrom: v })}
        />
      </section>

      <section>
        <h2 className="mb-1 font-heading text-2xl text-white">The stage chain</h2>
        <p className="mb-3 max-w-3xl font-body text-sm font-light text-muted">
          The chain is data, not code — this table <em>is</em> the workflow
          definition the board runs on. &ldquo;Done by&rdquo; counts days{" "}
          <em>before</em> the PIO date, so it falls as the chain progresses (14
          at the first stage, 0 at the last). Raising it makes a stage stricter;
          it must stay under the {settings.windowDays}-day window.
        </p>
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full text-left font-body text-[13.5px]">
            <thead>
              <tr className="bg-surface text-[11px] uppercase tracking-[0.12em] text-secondary">
                <th className="px-4 py-2.5 font-bold">#</th>
                <th className="px-4 py-2.5 font-bold">Stage</th>
                <th className="px-4 py-2.5 font-bold">Waiting on</th>
                <th className="px-4 py-2.5 font-bold">Done by (days before PIO)</th>
                <th className="px-4 py-2.5 font-bold">WIOs here now</th>
              </tr>
            </thead>
            <tbody>
              {stages.map((s) => {
                const here = board.wios.filter((w) => !w.pioReleased && w.stageId === s.id).length;
                return (
                  <tr key={s.id} className="border-t border-line bg-card transition-colors hover:bg-hover">
                    <td className="px-4 py-2.5 font-light text-muted">{s.position}</td>
                    <td className="px-4 py-2.5 font-bold text-ink">{s.stage}</td>
                    <td className="px-4 py-2.5">
                      <InlineText
                        value={s.waitingOn}
                        disabled={!editable || busyId === s.id}
                        onCommit={(v) => onStage(s.id, { waitingOn: v })}
                      />
                      {s.stage === "PIO" || s.waitingOn === "WIO raised by" ? (
                        <span className="mt-1 block font-body text-[11px] font-light text-muted">
                          Placeholder — resolves to whoever raised the WIO
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-2.5">
                      <InlineNumber
                        value={s.doneBy}
                        disabled={!editable || busyId === s.id}
                        onCommit={(v) => onStage(s.id, { doneBy: v })}
                      />
                    </td>
                    <td className="px-4 py-2.5 font-light text-secondary">
                      {here === 0 ? <span className="text-muted">none</span> : here}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {!editable ? (
        <p className="mt-6 rounded-lg border border-line bg-card px-5 py-3 font-body text-sm font-light text-muted">
          You have view access to this board. Changing the stamped date, the
          window or the chain is restricted to the team that owns it.
        </p>
      ) : null}
    </div>
  );
}

function NumberSetting({
  label,
  suffix,
  value,
  disabled,
  help,
  onCommit,
}: {
  label: string;
  suffix: string;
  value: number;
  disabled: boolean;
  help: string;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  return (
    <div className="rounded-lg border border-line bg-card px-5 py-4">
      <span className="mb-1 block font-body text-[11px] font-light uppercase tracking-[0.14em] text-muted">
        {label}
      </span>
      <div className="flex items-baseline gap-2">
        <input
          type="number"
          min={0}
          value={draft}
          disabled={disabled}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            const parsed = Number(draft);
            if (Number.isInteger(parsed) && parsed !== value) onCommit(parsed);
            else setDraft(String(value));
          }}
          className="w-24 rounded border border-line-strong bg-canvas px-2.5 py-1.5 font-body text-lg font-light text-ink focus:border-amber-deep focus:outline-none disabled:opacity-50"
        />
        <span className="font-body text-sm font-light text-muted">{suffix}</span>
      </div>
      <p className="mt-2 font-body text-xs font-light text-muted">{help}</p>
    </div>
  );
}

function InlineText({
  value,
  disabled,
  onCommit,
}: {
  value: string;
  disabled: boolean;
  onCommit: (value: string) => void;
}) {
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
      className="w-full min-w-[10rem] rounded border border-line-strong bg-canvas px-2.5 py-1.5 font-body text-[13px] font-light text-ink focus:border-amber-deep focus:outline-none disabled:opacity-50"
    />
  );
}

function InlineNumber({
  value,
  disabled,
  onCommit,
}: {
  value: number;
  disabled: boolean;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  return (
    <input
      type="number"
      min={0}
      value={draft}
      disabled={disabled}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const parsed = Number(draft);
        if (Number.isInteger(parsed) && parsed !== value) onCommit(parsed);
        else setDraft(String(value));
      }}
      className="w-24 rounded border border-line-strong bg-canvas px-2.5 py-1.5 font-body text-[13px] font-light text-ink focus:border-amber-deep focus:outline-none disabled:opacity-50"
    />
  );
}
