import { NAV, type NavGroup } from "@/components/shell/nav";

/**
 * Launch mode — which of the portal's screens this deployment actually serves.
 *
 *   full     (default)  the whole portal
 *   tracker             S4b · WIO → PIO Tracker only
 *
 * The point is to put the tracker in front of the WIO team on its own
 * subdomain NOW, months before the rest of the portal is finished, WITHOUT
 * forking the codebase. A fork would mean re-implementing sign-in, the RBAC
 * engine and the audit trail, then reconciling two divergent copies at merge
 * time. This is one variable instead, and "merging later" becomes changing it.
 *
 * Set with NEXT_PUBLIC_PORTAL_MODE. It is NEXT_PUBLIC_ deliberately: the nav is
 * rendered by a client component, and one variable readable from both sides
 * cannot drift the way a server/client pair would. It is inlined at build time,
 * so changing it needs a rebuild — correct for a launch setting, which should
 * not be flippable at runtime.
 *
 * THIS IS NOT ACCESS CONTROL. It decides which screens a deployment serves, not
 * who may see what — that is RBAC (public.permissions) and RLS, which still
 * apply underneath and are the only things that decide whether a given person
 * can read a given row. Tracker mode does enforce itself at the route level
 * (middleware.ts), so hidden screens are genuinely unreachable rather than
 * merely unlinked — but a screen closed only by this flag is closed by
 * configuration, not by permission.
 */

export type PortalMode = "full" | "tracker";

export function portalMode(): PortalMode {
  return process.env.NEXT_PUBLIC_PORTAL_MODE === "tracker" ? "tracker" : "full";
}

/** Where a deployment sends someone who asks for "/" or a closed screen. */
export function homeHref(mode: PortalMode = portalMode()): string {
  return mode === "tracker" ? "/wio-tracker" : "/dashboard";
}

/**
 * Route prefixes served in tracker mode.
 *
 * The tracker itself, plus the plumbing the shell around it needs: sign-in, the
 * session/logout endpoints behind the user menu, and notifications, without
 * which the header's bell throws on every page load. Everything else is closed.
 */
const TRACKER_MODE_PREFIXES = [
  "/wio-tracker",
  "/api/wio-tracker",
  "/login",
  "/api/auth",
  "/api/me",
  "/notifications",
  "/api/notifications",
] as const;

export function isRouteAllowed(pathname: string, mode: PortalMode = portalMode()): boolean {
  if (mode === "full") return true;
  return TRACKER_MODE_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

/**
 * The nav for this deployment. Groups that end up empty are dropped, so tracker
 * mode shows one "Delivery" group with one entry rather than six headings over
 * nothing.
 */
export function visibleNav(mode: PortalMode = portalMode()): NavGroup[] {
  if (mode === "full") return NAV;
  return NAV.map((group) => ({
    ...group,
    items: group.items.filter((item) => isRouteAllowed(item.href, mode)),
  })).filter((group) => group.items.length > 0);
}
