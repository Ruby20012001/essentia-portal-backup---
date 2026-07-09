import { describe, expect, it } from "vitest";
import { computeSlaRisk } from "@/lib/services/workflow-advisory";

/** Deterministic SLA-breach risk (the AI part is advisory + DB-backed). */
describe("computeSlaRisk", () => {
  const now = new Date("2026-07-09T12:00:00Z");

  it("no deadlines → 'none'", () => {
    expect(computeSlaRisk(now, [null, null]).level).toBe("none");
  });

  it("a past deadline → 'breached'", () => {
    const r = computeSlaRisk(now, ["2026-07-09T10:00:00Z", "2026-07-10T00:00:00Z"]);
    expect(r.level).toBe("breached");
    expect(r.breachedCount).toBe(1);
  });

  it("< 12h remaining → 'high'", () => {
    expect(computeSlaRisk(now, ["2026-07-09T18:00:00Z"]).level).toBe("high");
  });

  it("12–24h remaining → 'medium'", () => {
    expect(computeSlaRisk(now, ["2026-07-10T08:00:00Z"]).level).toBe("medium");
  });

  it("> 24h remaining → 'ok', hours reported from the earliest deadline", () => {
    const r = computeSlaRisk(now, ["2026-07-11T12:00:00Z", "2026-07-12T12:00:00Z"]);
    expect(r.level).toBe("ok");
    expect(r.hoursRemaining).toBe(48);
  });
});
