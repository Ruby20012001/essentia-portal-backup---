import { describe, expect, it } from "vitest";
import { buildRows, healthState, INTEGRATIONS, summarise, type LatestCheck } from "@/lib/services/api-health-logic";

const now = new Date("2026-10-05T08:14:00Z");
const minsAgo = (m: number) => new Date(now.getTime() - m * 60_000).toISOString();
const check = (over: Partial<LatestCheck>): LatestCheck => ({
  integration: "keka",
  status: "healthy",
  checkedAt: minsAgo(2),
  responseMs: 200,
  error: null,
  ...over,
});

describe("API health rules", () => {
  it("lists all eleven integrations", () => {
    expect(INTEGRATIONS).toHaveLength(11);
  });

  it("no check is never green", () => {
    expect(healthState(undefined, now)).toBe("Never checked");
  });

  it("a result older than three pulses is stale, whatever it said", () => {
    expect(healthState(check({ checkedAt: minsAgo(15) }), now)).toBe("Healthy");
    expect(healthState(check({ checkedAt: minsAgo(16) }), now)).toBe("Stale");
    expect(healthState(check({ status: "down", checkedAt: minsAgo(60) }), now)).toBe("Stale");
  });

  it("reads degraded and down as they were logged", () => {
    expect(healthState(check({ status: "degraded" }), now)).toBe("Degraded");
    expect(healthState(check({ status: "down" }), now)).toBe("Down");
  });

  it("builds a row for every integration, unbuilt by default", () => {
    const rows = buildRows(
      [check({}), check({ integration: "zakya", status: "degraded", responseMs: null })],
      [{ integration: "zakya", consecutiveFailures: 3, firstFailureAt: minsAgo(30), degraded: true }],
      { keka: "Test data" },
      now,
    );
    expect(rows).toHaveLength(11);
    expect(rows.find((r) => r.key === "keka")).toMatchObject({ state: "Healthy", wiring: "Test data" });
    expect(rows.find((r) => r.key === "zakya")).toMatchObject({ state: "Degraded", failures: 3 });
    expect(rows.find((r) => r.key === "hubspot")).toMatchObject({ state: "Never checked", wiring: "Not built" });
  });

  it("summary counts healthy, averages only healthy timings, and reports uptime", () => {
    const rows = buildRows(
      [check({ responseMs: 100 }), check({ integration: "twilio", responseMs: 50 }), check({ integration: "zakya", status: "down" })],
      [],
      {},
      now,
    );
    const s = summarise(rows, { total: 1000, healthy: 998 });
    expect(s).toMatchObject({ healthy: 2, total: 11, avgMs: 75, uptimePct: 99.8, unmonitored: 8 });
    expect(s.problems.map((p) => p.key)).toEqual(["zakya"]);
    expect(summarise(buildRows([], [], {}, now), { total: 0, healthy: 0 })).toMatchObject({ avgMs: null, uptimePct: null });
  });
});
