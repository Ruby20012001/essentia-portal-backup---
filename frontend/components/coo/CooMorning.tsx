import { RagDot } from "@/components/dashboard/RagDot";
import { formatINR } from "@/lib/format";
import type { BriefNumber, BriefStatus } from "@/lib/services/founder-brief";
import { arAction, type ArAction, type ArInvoice, type VerticalHealth } from "@/lib/services/coo-morning-logic";

/**
 * S8 · COO — the four Morning Numbers, cross-vertical health and AR ageing.
 * Read-only; the decisions themselves happen on the screens these point to.
 * Dark theme, same tokens as the Founder Brief.
 */

export function MorningNumbers({ numbers }: { numbers: BriefNumber[] }) {
  return (
    <ol className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {numbers.map((num) => (
        <li key={num.n} className="flex flex-col rounded-lg border border-line bg-card px-5 py-4">
          <span className="flex items-center justify-between gap-2">
            <span className="font-body text-[11px] font-light uppercase tracking-[0.16em] text-muted">
              {num.label}
            </span>
            <StatusPill status={num.status} />
          </span>
          <span className="mt-2 font-body text-xl font-light leading-tight text-white">{num.value}</span>
          <span className="mt-1 font-body text-xs font-light text-muted">{num.detail}</span>
        </li>
      ))}
    </ol>
  );
}

export function VerticalHealthStrip({ health }: { health: VerticalHealth[] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-line">
      {health.map((h, i) => (
        <div
          key={h.name}
          className={`flex flex-wrap items-center gap-x-4 gap-y-1 bg-card px-5 py-3 ${i > 0 ? "border-t border-line" : ""}`}
        >
          <RagDot rag={h.rag} />
          <span className="w-36 shrink-0 font-body text-[13px] font-bold text-white">{h.name}</span>
          <span className="min-w-0 flex-1 font-body text-sm font-light text-white">{h.value}</span>
          <span className="font-body text-xs font-light text-muted">{h.detail}</span>
        </div>
      ))}
    </div>
  );
}

const ACTION_TONE: Record<ArAction, string> = {
  Escalate: "bg-error/10 text-error",
  "Follow up": "bg-warning/10 text-warning",
  Monitor: "bg-white/5 text-muted",
};

export function ArAgeingTable({ invoices }: { invoices: ArInvoice[] }) {
  if (invoices.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-line-strong bg-card px-8 py-10 text-center">
        <p className="font-heading text-2xl text-white">Nothing over 30 days</p>
        <p className="mt-1 font-body text-sm font-light text-muted">
          Every raised invoice is either paid or inside 30 days.
        </p>
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full text-left font-body text-[13.5px]">
        <thead>
          <tr className="bg-surface text-[11px] uppercase tracking-[0.12em] text-secondary">
            <th className="px-4 py-2.5 font-bold">Family</th>
            <th className="px-4 py-2.5 font-bold">Invoice</th>
            <th className="px-4 py-2.5 text-right font-bold">Outstanding</th>
            <th className="px-4 py-2.5 text-right font-bold">Days</th>
            <th className="px-4 py-2.5 font-bold">TL</th>
            <th className="px-4 py-2.5 font-bold">Action</th>
          </tr>
        </thead>
        <tbody>
          {invoices.map((inv, i) => {
            const action = arAction(inv.days);
            return (
              <tr
                key={`${inv.invoiceNumber ?? "inv"}-${i}`}
                className="border-t border-line bg-card transition-colors hover:bg-hover"
              >
                <td className="px-4 py-2.5">
                  <span className="block font-bold text-white">{inv.family ?? "—"}</span>
                  {inv.project ? <span className="block text-xs font-light text-muted">{inv.project}</span> : null}
                </td>
                <td className="px-4 py-2.5 font-light text-secondary">{inv.invoiceNumber ?? "—"}</td>
                <td className="px-4 py-2.5 text-right font-light tabular-nums text-white">
                  {formatINR(inv.outstanding)}
                </td>
                <td className="px-4 py-2.5 text-right font-light tabular-nums text-white">{inv.days}</td>
                <td className="px-4 py-2.5 font-light text-secondary">{inv.tl ?? "—"}</td>
                <td className="px-4 py-2.5">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${ACTION_TONE[action]}`}
                  >
                    {action}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const PILL: Record<BriefStatus, { label: string; className: string } | null> = {
  ok: { label: "On track", className: "bg-success/10 text-success" },
  watch: { label: "Watch", className: "bg-warning/10 text-warning" },
  action: { label: "Action", className: "bg-error/10 text-error" },
  none: null,
  unwired: { label: "Not wired", className: "bg-white/5 text-muted" },
};

function StatusPill({ status }: { status: BriefStatus }) {
  const pill = PILL[status];
  if (!pill) return null;
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 font-body text-[10px] font-bold uppercase tracking-wide ${pill.className}`}>
      {pill.label}
    </span>
  );
}
