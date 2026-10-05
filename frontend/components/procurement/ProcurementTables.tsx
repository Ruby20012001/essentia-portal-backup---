import { formatINR } from "@/lib/format";
import {
  awaitingThreeQuotes,
  docStatusLabel,
  grnDueToday,
  lateDelivery,
  vrnState,
  type PoRow,
  type VendorRow,
  type VrnState,
  type WoRow,
} from "@/lib/services/procurement-logic";

/**
 * S9 · Procurement tables — recent work orders, purchase orders that need
 * something, and VRN status. Read-only; styling only. Dark theme.
 */

const TH = "px-4 py-2.5 font-bold";
const TD = "px-4 py-2.5 font-light";

function Table({ head, children }: { head: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full text-left font-body text-[13.5px]">
        <thead>
          <tr className="bg-surface text-[11px] uppercase tracking-[0.12em] text-secondary">{head}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-dashed border-line-strong bg-card px-8 py-10 text-center">
      <p className="font-heading text-2xl text-white">{title}</p>
      <p className="mt-1 font-body text-sm font-light text-muted">{body}</p>
    </div>
  );
}

function Pill({ text, tone }: { text: string; tone: "error" | "warning" | "success" | "muted" }) {
  const cls = {
    error: "bg-error/10 text-error",
    warning: "bg-warning/10 text-warning",
    success: "bg-success/10 text-success",
    muted: "bg-white/5 text-muted",
  }[tone];
  return (
    <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${cls}`}>
      {text}
    </span>
  );
}

const DOC_TONE: Record<string, "error" | "warning" | "success" | "muted"> = {
  approved: "success",
  pending_approval: "warning",
  rejected: "error",
};

export function WorkOrdersTable({ rows }: { rows: WoRow[] }) {
  if (rows.length === 0) return <Empty title="No work orders yet" body="Work orders appear here once they are raised." />;
  return (
    <Table
      head={
        <>
          <th className={TH}>WO number</th>
          <th className={TH}>Vendor · project</th>
          <th className={TH}>Trade</th>
          <th className={`${TH} text-right`}>Value</th>
          <th className={`${TH} text-right`}>Coord. charge</th>
          <th className={`${TH} text-right`}>Total</th>
          <th className={TH}>Status</th>
        </>
      }
    >
      {rows.map((w) => (
        <tr key={w.woNumber} className="border-t border-line bg-card transition-colors hover:bg-hover">
          <td className="px-4 py-2.5 font-bold text-white">{w.woNumber}</td>
          <td className={TD}>
            <span className="block text-white">{w.vendor}</span>
            {w.project ? <span className="block text-xs text-muted">{w.project}</span> : null}
          </td>
          <td className={`${TD} text-secondary`}>{w.trade ?? "—"}</td>
          <td className={`${TD} text-right tabular-nums text-white`}>{formatINR(w.value)}</td>
          <td className={`${TD} text-right tabular-nums text-secondary`}>
            {w.coordPct > 0 ? `+${w.coordPct}% · ${formatINR(w.coordAmt)}` : "0%"}
          </td>
          <td className={`${TD} text-right tabular-nums text-white`}>{formatINR(w.total)}</td>
          <td className="px-4 py-2.5">
            <Pill text={docStatusLabel(w.status)} tone={DOC_TONE[w.status] ?? "muted"} />
          </td>
        </tr>
      ))}
    </Table>
  );
}

/** What a PO is waiting on, most urgent first. Null means it needs nothing today. */
function poFlag(po: PoRow, today: string): { text: string; tone: "error" | "warning" } | null {
  if (lateDelivery(po, today)) return { text: "Delivery late", tone: "error" };
  if (awaitingThreeQuotes(po)) return { text: "Needs 3 quotes", tone: "warning" };
  if (grnDueToday(po, today)) return { text: "GRN due today", tone: "warning" };
  return null;
}

export function PurchaseOrdersTable({ rows, today }: { rows: PoRow[]; today: string }) {
  const flagged = rows
    .map((po) => ({ po, flag: poFlag(po, today) }))
    .filter((x): x is { po: PoRow; flag: NonNullable<ReturnType<typeof poFlag>> } => x.flag !== null);
  if (flagged.length === 0) {
    return <Empty title="No purchase orders need anything" body="Nothing is late, waiting on quotes, or due for a GRN today." />;
  }
  return (
    <Table
      head={
        <>
          <th className={TH}>PO number</th>
          <th className={TH}>Vendor · project</th>
          <th className={`${TH} text-right`}>Amount</th>
          <th className={TH}>Expected</th>
          <th className={TH}>Needs</th>
        </>
      }
    >
      {flagged.map(({ po, flag }) => (
        <tr key={po.id} className="border-t border-line bg-card transition-colors hover:bg-hover">
          <td className="px-4 py-2.5 font-bold text-white">{po.poNumber}</td>
          <td className={TD}>
            <span className="block text-white">{po.vendor}</span>
            {po.project ? <span className="block text-xs text-muted">{po.project}</span> : null}
          </td>
          <td className={`${TD} text-right tabular-nums text-white`}>{formatINR(po.total)}</td>
          <td className={`${TD} text-secondary`}>{po.expectedDelivery ? formatDate(po.expectedDelivery) : "—"}</td>
          <td className="px-4 py-2.5">
            <Pill text={flag.text} tone={flag.tone} />
          </td>
        </tr>
      ))}
    </Table>
  );
}

const VRN_TONE: Record<VrnState, "error" | "warning" | "success" | "muted"> = {
  Active: "success",
  "Renewal due": "warning",
  Expired: "error",
  Suspended: "warning",
  Revoked: "muted",
  "No expiry set": "warning",
};

export function VrnTable({ rows, today }: { rows: VendorRow[]; today: string }) {
  if (rows.length === 0) return <Empty title="No vendors registered" body="Vendors appear here once they hold a VRN." />;
  return (
    <Table
      head={
        <>
          <th className={TH}>VRN</th>
          <th className={TH}>Company</th>
          <th className={`${TH} text-right`}>Score</th>
          <th className={`${TH} text-right`}>Open WOs</th>
          <th className={TH}>Renewal</th>
          <th className={TH}>Status</th>
        </>
      }
    >
      {rows.map((v) => {
        const state = vrnState(v, today);
        return (
          <tr key={v.id} className="border-t border-line bg-card transition-colors hover:bg-hover">
            <td className="px-4 py-2.5 font-bold text-white">{v.vrn}</td>
            <td className={TD}>
              <span className="text-white">{v.company}</span>
              {v.preferred ? <span className="ml-2 text-xs text-brand">Preferred</span> : null}
              {v.type ? <span className="block text-xs capitalize text-muted">{v.type}</span> : null}
            </td>
            <td className={`${TD} text-right tabular-nums text-white`}>{v.score != null ? v.score.toFixed(1) : "—"}</td>
            <td className={`${TD} text-right tabular-nums text-white`}>{v.openWos}</td>
            <td className={`${TD} text-secondary`}>{v.expiry ? formatDate(v.expiry) : "—"}</td>
            <td className="px-4 py-2.5">
              <Pill text={state} tone={VRN_TONE[state]} />
            </td>
          </tr>
        );
      })}
    </Table>
  );
}

function formatDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
