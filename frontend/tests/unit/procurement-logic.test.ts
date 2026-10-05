import { describe, expect, it } from "vitest";
import {
  awaitingThreeQuotes,
  daysBetween,
  grnDueToday,
  lateDelivery,
  sortVendors,
  vrnState,
  type PoRow,
  type VendorRow,
} from "@/lib/services/procurement-logic";

const today = "2026-10-05";

const vendor = (over: Partial<VendorRow>): VendorRow => ({
  id: "v",
  vrn: "VRN/26-27/001",
  company: "Test Vendor",
  type: "contractor",
  status: "active",
  expiry: "2027-03-31",
  score: 8,
  preferred: false,
  openWos: 0,
  ...over,
});

const po = (over: Partial<PoRow>): PoRow => ({
  id: "p",
  poNumber: "ESS/PO/2026/0001",
  vendor: "Test Vendor",
  project: null,
  total: 30_000,
  quotesSatisfied: false,
  quotesWaived: false,
  status: "pending_approval",
  expectedDelivery: null,
  delivered: false,
  ...over,
});

describe("Procurement rules", () => {
  it("counts days across a month end", () => {
    expect(daysBetween("2026-10-05", "2026-11-04")).toBe(30);
    expect(daysBetween("2026-10-05", "2026-10-04")).toBe(-1);
  });

  it("a VRN is due for renewal in its last 30 days, expired after", () => {
    expect(vrnState(vendor({ expiry: "2026-11-05" }), today)).toBe("Active");
    expect(vrnState(vendor({ expiry: "2026-11-04" }), today)).toBe("Renewal due");
    expect(vrnState(vendor({ expiry: "2026-10-05" }), today)).toBe("Renewal due");
    expect(vrnState(vendor({ expiry: "2026-10-04" }), today)).toBe("Expired");
    expect(vrnState(vendor({ expiry: null }), today)).toBe("No expiry set");
  });

  it("revoked and suspended win over any date", () => {
    expect(vrnState(vendor({ status: "revoked", expiry: "2026-10-01" }), today)).toBe("Revoked");
    expect(vrnState(vendor({ status: "suspended" }), today)).toBe("Suspended");
  });

  it("sorts the worst VRNs to the top", () => {
    const rows = sortVendors(
      [
        vendor({ company: "A", status: "revoked" }),
        vendor({ company: "B" }),
        vendor({ company: "C", expiry: "2026-10-20" }),
        vendor({ company: "D", expiry: "2026-09-01" }),
      ],
      today,
    );
    expect(rows.map((r) => r.company)).toEqual(["D", "C", "B", "A"]);
  });

  it("three quotes are needed above ₹25,000 unless satisfied or waived", () => {
    expect(awaitingThreeQuotes(po({}))).toBe(true);
    expect(awaitingThreeQuotes(po({ total: 25_000 }))).toBe(false);
    expect(awaitingThreeQuotes(po({ quotesSatisfied: true }))).toBe(false);
    expect(awaitingThreeQuotes(po({ quotesWaived: true }))).toBe(false);
    expect(awaitingThreeQuotes(po({ status: "approved" }))).toBe(false);
  });

  it("a GRN is due today only for an approved PO not yet delivered", () => {
    expect(grnDueToday(po({ status: "approved", expectedDelivery: today }), today)).toBe(true);
    expect(grnDueToday(po({ status: "approved", expectedDelivery: today, delivered: true }), today)).toBe(false);
    expect(grnDueToday(po({ status: "draft", expectedDelivery: today }), today)).toBe(false);
    expect(lateDelivery(po({ status: "approved", expectedDelivery: "2026-10-01" }), today)).toBe(true);
  });
});
