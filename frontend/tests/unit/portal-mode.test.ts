import { describe, expect, it } from "vitest";
import { NAV } from "@/components/shell/nav";
import {
  homeHref,
  isRouteAllowed,
  visibleNav,
  type PortalMode,
} from "@/lib/portal-mode";

/**
 * Launch mode — serving the tracker on its own subdomain months before the rest
 * of the portal exists, without forking the codebase.
 *
 * Mode is passed explicitly here rather than read from the environment.
 * NEXT_PUBLIC_ variables are inlined at build time, so mutating process.env in
 * a test would not change what the bundled code sees — a test that appeared to
 * pass while proving nothing.
 */

const FULL: PortalMode = "full";
const TRACKER: PortalMode = "tracker";

describe("full mode — the whole portal", () => {
  it("serves every route", () => {
    for (const p of ["/dashboard", "/wio-pio", "/wio-tracker", "/eh", "/api/pio"]) {
      expect(isRouteAllowed(p, FULL)).toBe(true);
    }
  });

  it("shows the nav unchanged", () => {
    expect(visibleNav(FULL)).toEqual(NAV);
  });

  it("goes home to the dashboard", () => {
    expect(homeHref(FULL)).toBe("/dashboard");
  });
});

describe("tracker mode — one screen", () => {
  it("serves the tracker and its API", () => {
    expect(isRouteAllowed("/wio-tracker", TRACKER)).toBe(true);
    expect(isRouteAllowed("/api/wio-tracker", TRACKER)).toBe(true);
    expect(isRouteAllowed("/api/wio-tracker/wios/abc", TRACKER)).toBe(true);
  });

  it("serves the shell's own plumbing, or the header breaks on every load", () => {
    for (const p of [
      "/login",
      "/api/auth/login",
      "/api/auth/logout",
      "/api/me",
      "/api/notifications",
      "/notifications",
    ]) {
      expect(isRouteAllowed(p, TRACKER), p).toBe(true);
    }
  });

  it("closes every other screen", () => {
    for (const p of [
      "/dashboard",
      "/wio-pio",
      "/eh",
      "/projects",
      "/founder-brief",
      "/exit-protocol",
      "/workflow-builder/new",
    ]) {
      expect(isRouteAllowed(p, TRACKER), p).toBe(false);
    }
  });

  it("closes the other modules' APIs too — not just their pages", () => {
    // The pages being unlinked is cosmetic; the data is what matters.
    for (const p of ["/api/pio", "/api/wio", "/api/eh/discounts", "/api/workflows"]) {
      expect(isRouteAllowed(p, TRACKER), p).toBe(false);
    }
  });

  it("does not let a prefix match leak a neighbouring route", () => {
    // "/wio-tracker" must not open "/wio-tracker-admin", and the S4 hub
    // (/wio-pio) must stay closed even though it shares the "/wio" stem.
    expect(isRouteAllowed("/wio-tracker-admin", TRACKER)).toBe(false);
    expect(isRouteAllowed("/wio-pio", TRACKER)).toBe(false);
    expect(isRouteAllowed("/api/wio", TRACKER)).toBe(false);
  });

  it("goes home to the tracker", () => {
    expect(homeHref(TRACKER)).toBe("/wio-tracker");
  });
});

describe("tracker mode — the nav", () => {
  const groups = visibleNav(TRACKER);

  it("lists the tracker", () => {
    const hrefs = groups.flatMap((g) => g.items.map((i) => i.href));
    expect(hrefs).toContain("/wio-tracker");
  });

  it("drops groups that would render as an empty heading", () => {
    expect(groups.every((g) => g.items.length > 0)).toBe(true);
    expect(groups.length).toBeLessThan(NAV.length);
  });

  it("every link it shows is a route it actually serves", () => {
    // The invariant that matters: no visible link may 404 or bounce the user.
    for (const g of groups) {
      for (const i of g.items) {
        expect(isRouteAllowed(i.href, TRACKER), i.href).toBe(true);
      }
    }
  });

  it("does not mutate the shared NAV constant", () => {
    // visibleNav maps and filters; if it ever spliced in place, full-mode
    // deployments would silently lose screens after one tracker-mode render.
    expect(NAV.length).toBeGreaterThan(groups.length);
    expect(visibleNav(FULL)).toEqual(NAV);
  });
});
