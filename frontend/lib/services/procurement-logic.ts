/**
 * S9 · Procurement — the rules, with no database (Brief §33). Tested on their
 * own so the screen and any later alert agree on what "renewal due" or
 * "awaiting three quotes" means.
 */

/** Three quotes are mandatory above this amount (Brief §33). */
export const THREE_QUOTES_ABOVE = 25_000;
/** A VRN is flagged for renewal this many days before it expires. */
export const VRN_RENEWAL_WINDOW_DAYS = 30;

export type VrnState = "Active" | "Renewal due" | "Expired" | "Suspended" | "Revoked" | "No expiry set";

export type VendorRow = {
  id: string;
  vrn: string;
  company: string;
  type: string | null;
  status: string | null;
  /** YYYY-MM-DD */
  expiry: string | null;
  score: number | null;
  preferred: boolean;
  openWos: number;
};

export type PoRow = {
  id: string;
  poNumber: string;
  vendor: string;
  project: string | null;
  total: number;
  quotesSatisfied: boolean;
  quotesWaived: boolean;
  status: string;
  /** YYYY-MM-DD */
  expectedDelivery: string | null;
  delivered: boolean;
};

export type WoRow = {
  woNumber: string;
  vendor: string;
  project: string | null;
  trade: string | null;
  value: number;
  coordPct: number;
  coordAmt: number;
  total: number;
  status: string;
};

/** Days from `from` to `to`, both YYYY-MM-DD, counted in UTC so no clock change shifts it. */
export function daysBetween(from: string, to: string): number {
  const ms = (s: string) => {
    const [y, m, d] = s.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((ms(to) - ms(from)) / 86_400_000);
}

export function vrnState(v: Pick<VendorRow, "status" | "expiry">, today: string): VrnState {
  if (v.status === "revoked") return "Revoked";
  if (v.status === "suspended") return "Suspended";
  if (!v.expiry) return "No expiry set";
  const left = daysBetween(today, v.expiry);
  if (left < 0) return "Expired";
  if (left <= VRN_RENEWAL_WINDOW_DAYS) return "Renewal due";
  return "Active";
}

/** Worst first, so the VRN table opens on what needs doing. */
const STATE_ORDER: VrnState[] = ["Expired", "Renewal due", "No expiry set", "Suspended", "Active", "Revoked"];

export function sortVendors(rows: VendorRow[], today: string): VendorRow[] {
  return [...rows].sort((a, b) => {
    const d = STATE_ORDER.indexOf(vrnState(a, today)) - STATE_ORDER.indexOf(vrnState(b, today));
    if (d !== 0) return d;
    return (a.expiry ?? "9999").localeCompare(b.expiry ?? "9999") || a.company.localeCompare(b.company);
  });
}

/** A PO that cannot go forward yet: above ₹25K, still open, with neither three quotes nor a waiver. */
export function awaitingThreeQuotes(po: PoRow): boolean {
  return (
    po.total > THREE_QUOTES_ABOVE &&
    !po.quotesSatisfied &&
    !po.quotesWaived &&
    (po.status === "draft" || po.status === "pending_approval")
  );
}

/** A delivery expected today and not yet received — a GRN the store should be ready to raise. */
export function grnDueToday(po: PoRow, today: string): boolean {
  return po.expectedDelivery === today && !po.delivered && po.status === "approved";
}

export function lateDelivery(po: PoRow, today: string): boolean {
  return !!po.expectedDelivery && po.expectedDelivery < today && !po.delivered && po.status === "approved";
}

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  pending_approval: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  superseded: "Superseded",
};

export function docStatusLabel(s: string): string {
  return STATUS_LABEL[s] ?? s;
}
