import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SESSION_COOKIE } from "@/lib/auth/constants";
import { isRouteAllowed } from "@/lib/portal-mode";

/**
 * middleware.ts is deliberately self-contained — it imports nothing but
 * next/server, because Vercel's Edge runtime rejected its module graph twice
 * (first the "@/" alias at build, then MIDDLEWARE_INVOCATION_FAILED at
 * runtime) while a local production build served every route correctly.
 *
 * The price of that is two copies of the same facts. These tests are the thing
 * that keeps them honest: change one side without the other and the suite
 * fails, rather than a route quietly opening in production.
 *
 * Read as source text rather than imported: importing middleware.ts pulls in
 * next/server, and the point here is the literals, not the behaviour.
 */
const SOURCE = readFileSync(
  join(process.cwd(), "middleware.ts"),
  "utf8",
);

function inlinedArray(name: string): string[] {
  const block = SOURCE.match(new RegExp(`const ${name} = \\[([^\\]]*)\\]`, "m"));
  if (!block) throw new Error(`${name} not found in middleware.ts`);
  return [...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

describe("middleware stays self-contained", () => {
  it("imports nothing but next/server", () => {
    // The whole reason the duplication below exists. If someone reintroduces a
    // local import, the Edge bundle grows a module graph again and the
    // deployment can fail in a way no local build reproduces.
    const imports = [...SOURCE.matchAll(/^import .* from "([^"]+)";/gm)].map((m) => m[1]);
    expect(imports).toEqual(["next/server"]);
  });
});

describe("the inlined copies match the app's", () => {
  it("SESSION_COOKIE is the same name the app reads", () => {
    const inlined = SOURCE.match(/const SESSION_COOKIE = "([^"]+)"/)?.[1];
    expect(inlined).toBe(SESSION_COOKIE);
  });

  it("every tracker-mode prefix is one the app also allows", () => {
    for (const p of inlinedArray("TRACKER_MODE_PREFIXES")) {
      expect(isRouteAllowed(p, "tracker"), p).toBe(true);
    }
  });

  it("and the app allows nothing the middleware would close", () => {
    // The dangerous direction: a prefix added to portal-mode.ts but not to the
    // middleware means the app links a screen the gate then redirects away
    // from — a broken link that only appears in tracker mode.
    const inlined = inlinedArray("TRACKER_MODE_PREFIXES");
    for (const p of ["/wio-tracker", "/api/wio-tracker", "/login", "/api/auth", "/api/me", "/notifications", "/api/notifications"]) {
      if (isRouteAllowed(p, "tracker")) expect(inlined, p).toContain(p);
    }
  });

  it("closes the same screens in both places", () => {
    const inlined = inlinedArray("TRACKER_MODE_PREFIXES");
    const under = (path: string) =>
      inlined.some((p) => path === p || path.startsWith(`${p}/`));
    for (const p of ["/dashboard", "/wio-pio", "/eh", "/projects", "/api/pio", "/api/wio"]) {
      expect(under(p), p).toBe(false);
      expect(isRouteAllowed(p, "tracker"), p).toBe(false);
    }
  });
});
