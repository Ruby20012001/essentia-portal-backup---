import { describe, expect, it } from "vitest";
import {
  agedInvoices,
  arAction,
  arNumber,
  centreHealth,
  eeHealth,
  factoryHealth,
  pioNumber,
  stockNumber,
  wioNumber,
  type ArInvoice,
} from "@/lib/services/coo-morning-logic";

const clock = (...days: number[]) => days.map((day, i) => ({ ref: `R${i}`, project: null, day }));
const inv = (days: number, outstanding = 100_000): ArInvoice => ({
  project: "Magnolias 701",
  family: "Test family",
  invoiceNumber: `INV-${days}`,
  outstanding,
  days,
  tl: null,
});

describe("COO morning numbers", () => {
  it("WIOs: Day 12 is watch, past Day 15 is action", () => {
    expect(wioNumber(clock(3, 11)).status).toBe("ok");
    expect(wioNumber(clock(3, 12))).toMatchObject({ status: "watch", value: "1 WIO" });
    expect(wioNumber(clock(12, 16)).status).toBe("action");
    expect(wioNumber(clock(12, 16)).value).toBe("2 WIOs · 1 past Day 15");
  });

  it("PIOs: Day 40 is watch, past Day 45 is action, an empty clock is none", () => {
    expect(pioNumber([]).status).toBe("none");
    expect(pioNumber(clock(10, 39)).status).toBe("ok");
    expect(pioNumber(clock(10, 40))).toMatchObject({ status: "watch", value: "1 PIO of 2 in production" });
    expect(pioNumber(clock(46)).status).toBe("action");
  });

  it("stock says it is not wired rather than inventing a number", () => {
    expect(stockNumber()).toMatchObject({ status: "unwired", value: "Not yet wired" });
  });

  it("AR: only past 30 days counts; 60 days is the COO's to escalate", () => {
    expect(arNumber([inv(30)]).status).toBe("ok");
    expect(arNumber([inv(31)]).status).toBe("watch");
    expect(arNumber([inv(31), inv(60)]).status).toBe("action");
    expect(arNumber([inv(45, 0)]).status).toBe("ok");
  });

  it("AR action follows the 45 / 60 day ladder", () => {
    expect(arAction(31)).toBe("Monitor");
    expect(arAction(45)).toBe("Follow up");
    expect(arAction(59)).toBe("Follow up");
    expect(arAction(60)).toBe("Escalate");
  });

  it("AR table is oldest first, then largest, and drops the rest", () => {
    const rows = agedInvoices([inv(35, 5), inv(70, 1), inv(10), inv(35, 9)]);
    expect(rows.map((r) => [r.days, r.outstanding])).toEqual([
      [70, 1],
      [35, 9],
      [35, 5],
    ]);
  });
});

describe("COO cross-vertical health", () => {
  it("EE goes red only past three projects behind", () => {
    expect(eeHealth({ green: 10, amber: 2, red: 0 }).rag).toBe("green");
    expect(eeHealth({ green: 10, amber: 2, red: 1 }).rag).toBe("amber");
    expect(eeHealth({ green: 10, amber: 2, red: 4 }).rag).toBe("red");
  });

  it("factory follows the PIO clock", () => {
    expect(factoryHealth(clock(5)).rag).toBe("green");
    expect(factoryHealth(clock(41)).rag).toBe("amber");
    expect(factoryHealth(clock(50)).rag).toBe("red");
  });

  it("a centre is judged against pace, and a violation is red regardless", () => {
    const c = { name: "Gurugram", target: 3_000_000, mtd: 1_000_000, violations: 0 };
    // On the 10th of a 30-day month, a third of target is exactly on pace.
    expect(centreHealth(c, 10, 30)).toMatchObject({ rag: "green", value: "33% of month target" });
    expect(centreHealth(c, 20, 30).rag).toBe("red");
    expect(centreHealth({ ...c, violations: 1 }, 10, 30).rag).toBe("red");
    expect(centreHealth({ ...c, target: 0 }, 10, 30).rag).toBe("amber");
  });
});
