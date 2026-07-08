import { describe, expect, it } from "vitest";
import { computeDueSlot } from "@/lib/services/scheduler";

/**
 * Pure slot computation — the deterministic core of the scheduler. The
 * DB-backed claim/retry/lock behaviour is proven in the db harness
 * (npm run validate); here we pin the arithmetic.
 */
describe("computeDueSlot", () => {
  it("interval: floors to the current slot boundary", () => {
    const now = new Date(Date.UTC(2026, 6, 8, 7, 0, 35));
    expect(computeDueSlot("interval", "60", now)?.getTime()).toBe(
      Date.UTC(2026, 6, 8, 7, 0, 0),
    );
  });

  it("interval: an exact boundary maps to itself", () => {
    const now = new Date(Date.UTC(2026, 6, 8, 7, 0, 0));
    expect(computeDueSlot("interval", "60", now)?.getTime()).toBe(
      Date.UTC(2026, 6, 8, 7, 0, 0),
    );
  });

  it("interval: invalid or zero expression → null", () => {
    expect(computeDueSlot("interval", "0", new Date())).toBeNull();
    expect(computeDueSlot("interval", "abc", new Date())).toBeNull();
  });

  it("daily: returns today's slot once now has passed HH:MM", () => {
    const now = new Date(2026, 6, 8, 9, 30, 0); // local 09:30
    const slot = computeDueSlot("daily", "07:00", now);
    expect(slot).not.toBeNull();
    expect(slot!.getHours()).toBe(7);
    expect(slot!.getMinutes()).toBe(0);
  });

  it("daily: null before the scheduled time", () => {
    const now = new Date(2026, 6, 8, 5, 0, 0); // local 05:00
    expect(computeDueSlot("daily", "07:00", now)).toBeNull();
  });

  it("daily: invalid expression → null", () => {
    expect(computeDueSlot("daily", "nope", new Date())).toBeNull();
  });
});
