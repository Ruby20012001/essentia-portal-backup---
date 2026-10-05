import { describe, expect, it } from "vitest";
import { classify, errorText, nextStreak } from "@/lib/services/api-health-pulse-logic";

const t = "2026-10-05T08:00:00.000Z";

describe("API health pulse rules", () => {
  it("fast is healthy, slow is degraded", () => {
    expect(classify({ kind: "ok", ms: 140 })).toBe("healthy");
    expect(classify({ kind: "ok", ms: 2_000 })).toBe("healthy");
    expect(classify({ kind: "ok", ms: 2_001 })).toBe("degraded");
  });

  it("rate-limited and overloaded are degraded; a bad key or no answer is down", () => {
    expect(classify({ kind: "http", ms: 90, status: 429, message: "rate limited" })).toBe("degraded");
    expect(classify({ kind: "http", ms: 90, status: 529, message: "overloaded" })).toBe("degraded");
    expect(classify({ kind: "http", ms: 90, status: 401, message: "invalid key" })).toBe("down");
    expect(classify({ kind: "http", ms: 90, status: 500, message: "error" })).toBe("down");
    expect(classify({ kind: "network", ms: null, message: "timed out" })).toBe("down");
  });

  it("error text is one short line", () => {
    expect(errorText({ kind: "ok", ms: 1 })).toBeNull();
    expect(errorText({ kind: "http", ms: 1, status: 401, message: "invalid\n  key" })).toBe("HTTP 401: invalid key");
    expect(errorText({ kind: "network", ms: null, message: "x".repeat(500) })).toHaveLength(300);
  });

  it("the third failure in a row degrades, and alerts once", () => {
    const one = nextStreak(null, "down", t);
    expect(one).toMatchObject({ consecutiveFailures: 1, firstFailureAt: t, degraded: false, justDegraded: false });
    const two = nextStreak(one, "degraded", "later");
    expect(two).toMatchObject({ consecutiveFailures: 2, firstFailureAt: t, degraded: false });
    const three = nextStreak(two, "down", "later");
    expect(three).toMatchObject({ consecutiveFailures: 3, degraded: true, justDegraded: true });
    expect(nextStreak(three, "down", "later")).toMatchObject({ consecutiveFailures: 4, degraded: true, justDegraded: false });
  });

  it("one healthy pulse ends the streak", () => {
    const failing = { consecutiveFailures: 4, firstFailureAt: t, degraded: true };
    expect(nextStreak(failing, "healthy", "later")).toMatchObject({
      consecutiveFailures: 0,
      firstFailureAt: null,
      degraded: false,
      recovered: true,
    });
    expect(nextStreak(null, "healthy", t).recovered).toBe(false);
  });
});
