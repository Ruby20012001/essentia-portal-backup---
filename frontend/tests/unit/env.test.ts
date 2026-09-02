import { afterEach, describe, expect, it } from "vitest";
import { missingPageEnv } from "@/lib/env";

/**
 * The production-deploy guard.
 *
 * This bug is invisible locally — every developer has AUTH_ALLOW_DEV_LOGIN and
 * DEV_USER_ID set, so the old check passed and nobody saw it. It only appears
 * on a real deployment, where it renders "Database not connected" to a properly
 * signed-in user on the dashboard they land on. That is exactly the kind of
 * defect a test has to hold, because nothing else will.
 */

const saved = { ...process.env };

afterEach(() => {
  process.env = { ...saved };
});

function env(vars: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

describe("missingPageEnv", () => {
  it("production, fully configured: nothing is missing", () => {
    env({
      DATABASE_URL: "postgres://user:pw@rds.example:5432/essentia",
      AUTH_ALLOW_DEV_LOGIN: undefined,
      DEV_USER_ID: undefined,
    });
    // The regression: this used to return ["DEV_USER_ID"] and blank the page.
    expect(missingPageEnv()).toEqual([]);
  });

  it("production: an explicit AUTH_ALLOW_DEV_LOGIN=false is still production", () => {
    env({
      DATABASE_URL: "postgres://x",
      AUTH_ALLOW_DEV_LOGIN: "false",
      DEV_USER_ID: undefined,
    });
    expect(missingPageEnv()).toEqual([]);
  });

  it("DATABASE_URL is always required — no screen renders without live data", () => {
    env({ DATABASE_URL: undefined, AUTH_ALLOW_DEV_LOGIN: undefined });
    expect(missingPageEnv()).toEqual(["DATABASE_URL"]);
  });

  it("dev bootstrap on but no DEV_USER_ID: say so, since that path reads it", () => {
    env({
      DATABASE_URL: "postgres://x",
      AUTH_ALLOW_DEV_LOGIN: "true",
      DEV_USER_ID: undefined,
    });
    expect(missingPageEnv()).toEqual(["DEV_USER_ID"]);
  });

  it("dev bootstrap on and configured: nothing missing", () => {
    env({
      DATABASE_URL: "postgres://x",
      AUTH_ALLOW_DEV_LOGIN: "true",
      DEV_USER_ID: "00000000-0000-4000-8000-00000000000b",
    });
    expect(missingPageEnv()).toEqual([]);
  });

  it("reports both when nothing is set and the bootstrap is on", () => {
    env({
      DATABASE_URL: undefined,
      AUTH_ALLOW_DEV_LOGIN: "true",
      DEV_USER_ID: undefined,
    });
    expect(missingPageEnv()).toEqual(["DATABASE_URL", "DEV_USER_ID"]);
  });

  it("only the literal string 'true' arms the dev bootstrap", () => {
    // Matches lib/auth/session.ts, which compares === "true". A truthy-looking
    // value like "1" must NOT be read as on, or the two disagree about which
    // mode the app is in.
    for (const value of ["1", "yes", "TRUE", "True", ""]) {
      env({ DATABASE_URL: "postgres://x", AUTH_ALLOW_DEV_LOGIN: value, DEV_USER_ID: undefined });
      expect(missingPageEnv(), `AUTH_ALLOW_DEV_LOGIN=${JSON.stringify(value)}`).toEqual([]);
    }
  });
});
