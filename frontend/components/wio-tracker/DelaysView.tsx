"use client";

import { useMemo, useState } from "react";
import type { TrackerBoard } from "@/lib/services/wio-tracker";

/**
 * Screen 3 — the delay log.
 *
 * Independent of a WIO's computed status on purpose. A row can read On track
 * and still carry an open delay, and that pairing is exactly the early warning
 * worth seeing; collapsing the two would hide it. The only place they meet is
 * the priority sort, where each open delay adds a little weight.
 *
 * `cause` and `source` are never typed — they are carried by the reason, filled
 * in here for preview and re-read from the reason server-side. Two people
 * logging the same reason must produce the same classification, or the delay
 * analysis is fiction.
 */

type Scope = "open" | "closed" | "all";

export function DelaysView({
  board,
  busyId,
  onCreate,
  onPatch,
}: {
  board: TrackerBoard;
  busyId: string | null;
  onCreate: (input: Record<string, unknown>) => Promise<boolean>;
  onPatch: (id: string, patch: Record<string, unknown>) => void;
}) {
  const [scope, setScope] = useState<Scope>("open");
  const [wioFilter, setWioFilter] = useState<string>("");
  const [adding, setAdding] = useState(false);

  const rows = useMemo(
    () =>
      board.delays
        .filter((d) => (scope === "all" ? true : scope === "open" ? d.status === "Open" : d.status === "Closed"))
        .filter((d) => (wioFilter === "" ? true : d.wioId === wioFilter)),
    [board.delays, scope, wioFilter],
  );

  const openCount = board.delays.filter((d) => d.status === "Open").length;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {(
          [
            ["open", "Open", openCount],
            ["closed", "Closed", board.delays.length - openCount],
            ["all", "All", board.delays.length],
          ] as const
        ).map(([key, label, count]) => (
          <button
            key={key}
            type="button"
            onClick={() => setScope(key)}
            className={`rounded border px-3 py-1.5 font-body text-xs font-bold transition-colors ${
              scope === key
                ? "border-line-strong bg-selected text-white"
                : "border-line bg-card text-secondary hover:bg-hover"
            }`}
          >
            {label}
            <span className="ml-2 font-light text-muted">{count}</span>
          </button>
        ))}

        <select
          value={wioFilter}
          onChange={(e) => setWioFilter(e.target.value)}
          className="ml-auto rounded border border-line-strong bg-card px-3 py-1.5 font-body text-sm font-light text-ink focus:border-amber-deep focus:outline-none"
        >
          <option value="">Every WIO</option>
          {board.wios.map((w) => (
            <option key={w.id} value={w.id}>
              {w.wio}
            </option>
          ))}
        </select>

        {board.can.logDelay ? (
          <button
            type="button"
            onClick={() => setAdding((v) => !v)}
            className="rounded bg-forest px-3 py-1.5 font-body text-xs font-bold text-white transition-colors hover:bg-forest/90"
          >
            {adding ? "Cancel" : "Log a delay"}
          </button>
        ) : null}
      </div>

      {adding ? (
        <AddDelayForm
          board={board}
          busy={busyId === "delay"}
          onCancel={() => setAdding(false)}
          onCreate={async (input) => {
            const ok = await onCreate(input);
            if (ok) setAdding(false);
            return ok;
          }}
        />
      ) : null}

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line-strong bg-card px-6 py-10 text-center font-body text-sm font-light text-muted">
          Nothing logged under this filter.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full text-left font-body text-[13.5px]">
            <thead>
              <tr className="bg-surface text-[11px] uppercase tracking-[0.12em] text-secondary">
                <th className="px-3 py-2.5 font-bold">Logged</th>
                <th className="px-3 py-2.5 font-bold">WIO</th>
                <th className="px-3 py-2.5 font-bold">Why</th>
                <th className="px-3 py-2.5 font-bold">Cause</th>
                <th className="px-3 py-2.5 font-bold">Source</th>
                <th className="px-3 py-2.5 font-bold">Owner</th>
                <th className="px-3 py-2.5 font-bold">Dept</th>
                <th className="px-3 py-2.5 font-bold">Started</th>
                <th className="px-3 py-2.5 font-bold text-right">Days lost</th>
                <th className="px-3 py-2.5 font-bold">Status</th>
                <th className="px-3 py-2.5 font-bold">Remark</th>
                <th className="px-3 py-2.5 font-bold" />
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr
                  key={d.id}
                  className="border-t border-line bg-card align-top transition-colors hover:bg-hover"
                >
                  <td className="whitespace-nowrap px-3 py-2.5 font-light text-muted">{d.date}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 font-bold text-ink">{d.wio}</td>
                  <td className="px-3 py-2.5 font-light text-ink">{d.why}</td>
                  <td className="px-3 py-2.5 font-light text-secondary">{d.cause}</td>
                  <td className="px-3 py-2.5">
                    {/* Source is a fact, not a severity. Client/Internal/Vendor
                        are toned neutrally so the log does not read as blame. */}
                    <span className="rounded border border-line-strong bg-surface px-2 py-0.5 font-body text-[11px] font-light text-secondary">
                      {d.source}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 font-light text-secondary">{d.owner ?? "—"}</td>
                  <td className="px-3 py-2.5 font-light text-muted">{d.dept ?? "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 font-light text-muted">
                    {d.started ?? "—"}
                    {d.ended ? (
                      <span className="block text-[11px]">ended {d.ended}</span>
                    ) : null}
                  </td>
                  <td
                    className={`px-3 py-2.5 text-right ${
                      (d.daysLost ?? 0) >= 7 ? "font-bold text-warning" : "font-light text-secondary"
                    }`}
                  >
                    {d.daysLost ?? "—"}
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`rounded border px-2 py-0.5 font-body text-[11px] font-bold uppercase tracking-[0.08em] ${
                        d.status === "Open"
                          ? "border-warning/40 bg-warning/10 text-warning"
                          : "border-forest/40 bg-forest/10 text-forest"
                      }`}
                    >
                      {d.status}
                    </span>
                  </td>
                  <td className="max-w-[20rem] px-3 py-2.5 font-light text-muted">{d.remark}</td>
                  <td className="px-3 py-2.5 text-right">
                    {board.can.logDelay && d.status === "Open" ? (
                      <button
                        type="button"
                        disabled={busyId === d.id}
                        onClick={() => onPatch(d.id, { status: "Closed" })}
                        className="whitespace-nowrap rounded border border-line-strong bg-canvas px-2.5 py-1.5 font-body text-xs font-bold text-secondary transition-colors hover:bg-hover disabled:opacity-50"
                      >
                        {busyId === d.id ? "…" : "Close"}
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AddDelayForm({
  board,
  busy,
  onCancel,
  onCreate,
}: {
  board: TrackerBoard;
  busy: boolean;
  onCancel: () => void;
  onCreate: (input: Record<string, unknown>) => Promise<boolean>;
}) {
  const [wioId, setWioId] = useState(board.wios[0]?.id ?? "");
  const [why, setWhy] = useState(board.reasons[0]?.reason ?? "");
  const [owner, setOwner] = useState("");
  const [dept, setDept] = useState("");
  const [started, setStarted] = useState(board.settings.today);
  const [remark, setRemark] = useState("");

  // Preview only. The server re-reads both from the chosen reason, so a stale
  // client can never write a mismatched cause/source pair.
  const reason = board.reasons.find((r) => r.reason === why);
  const blank = (v: string) => (v.trim() === "" ? null : v.trim());

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const ok = await onCreate({
          wioId,
          why,
          owner: blank(owner),
          dept: blank(dept),
          started: blank(started),
          remark: blank(remark),
        });
        if (ok) {
          setOwner("");
          setDept("");
          setRemark("");
        }
      }}
      className="mb-6 rounded-lg border border-line bg-card px-5 py-4"
    >
      <h3 className="mb-3 font-heading text-lg text-white">Log a delay</h3>
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4">
        <label className="block">
          <span className="mb-1 block font-body text-[11px] font-light uppercase tracking-[0.14em] text-muted">
            WIO *
          </span>
          <select
            value={wioId}
            onChange={(e) => setWioId(e.target.value)}
            className="w-full rounded border border-line-strong bg-canvas px-2.5 py-1.5 font-body text-[13px] font-light text-ink focus:border-amber-deep focus:outline-none"
          >
            {board.wios.map((w) => (
              <option key={w.id} value={w.id}>
                {w.wio} — {w.stage}
              </option>
            ))}
          </select>
        </label>

        <label className="block lg:col-span-2">
          <span className="mb-1 block font-body text-[11px] font-light uppercase tracking-[0.14em] text-muted">
            Why *
          </span>
          <select
            value={why}
            onChange={(e) => setWhy(e.target.value)}
            className="w-full rounded border border-line-strong bg-canvas px-2.5 py-1.5 font-body text-[13px] font-light text-ink focus:border-amber-deep focus:outline-none"
          >
            {board.reasons.map((r) => (
              <option key={r.reason} value={r.reason}>
                {r.reason}
              </option>
            ))}
          </select>
          <span className="mt-1 block font-body text-[11px] font-light text-muted">
            Fills cause{" "}
            <span className="text-secondary">{reason?.cause ?? "—"}</span> · source{" "}
            <span className="text-secondary">{reason?.source ?? "—"}</span>
          </span>
        </label>

        <label className="block">
          <span className="mb-1 block font-body text-[11px] font-light uppercase tracking-[0.14em] text-muted">
            Started
          </span>
          <input
            type="date"
            value={started}
            onChange={(e) => setStarted(e.target.value)}
            className="w-full rounded border border-line-strong bg-canvas px-2.5 py-1.5 font-body text-[13px] font-light text-ink focus:border-amber-deep focus:outline-none"
          />
        </label>

        <label className="block">
          <span className="mb-1 block font-body text-[11px] font-light uppercase tracking-[0.14em] text-muted">
            Owner
          </span>
          <input
            value={owner}
            list="delay-people"
            onChange={(e) => setOwner(e.target.value)}
            className="w-full rounded border border-line-strong bg-canvas px-2.5 py-1.5 font-body text-[13px] font-light text-ink focus:border-amber-deep focus:outline-none"
          />
          <datalist id="delay-people">
            {board.people.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </label>

        <label className="block">
          <span className="mb-1 block font-body text-[11px] font-light uppercase tracking-[0.14em] text-muted">
            Dept
          </span>
          <input
            value={dept}
            onChange={(e) => setDept(e.target.value)}
            className="w-full rounded border border-line-strong bg-canvas px-2.5 py-1.5 font-body text-[13px] font-light text-ink focus:border-amber-deep focus:outline-none"
          />
        </label>

        <label className="block lg:col-span-2">
          <span className="mb-1 block font-body text-[11px] font-light uppercase tracking-[0.14em] text-muted">
            Remark
          </span>
          <input
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
            className="w-full rounded border border-line-strong bg-canvas px-2.5 py-1.5 font-body text-[13px] font-light text-ink focus:border-amber-deep focus:outline-none"
          />
        </label>
      </div>
      <div className="mt-4 flex gap-2">
        <button
          type="submit"
          disabled={busy || !wioId || !why}
          className="rounded bg-forest px-4 py-1.5 font-body text-xs font-bold text-white transition-colors hover:bg-forest/90 disabled:opacity-50"
        >
          {busy ? "Logging…" : "Log it"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded border border-line-strong bg-canvas px-4 py-1.5 font-body text-xs font-bold text-secondary transition-colors hover:bg-hover"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
