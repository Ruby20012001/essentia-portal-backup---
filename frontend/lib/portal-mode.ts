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
 *
 * THIS FILE MUST STAY DEPENDENCY-FREE. middleware.ts imports it, and middleware
 * runs on the Edge runtime, which bundles separately and refuses modules it
 * cannot resolve. It previously imported the nav constant from components/, and
 * Vercel rejected the whole middleware for it — a failure a local `next build`
 * does not reproduce, because local builds resolve those specifiers happily.
 * The nav-filtering helper that needed it now lives beside the nav itself.
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
  // The concept decks and their own sign-in page. This deployment runs in
  // tracker mode, so a route missing from this list is not merely unlinked —
  // signing in at /deck-login sent the design team to the tracker instead,
  // which is the one place they are not allowed (10 Sep 2026).
  "/decks",
  // the open one, read by anybody with the link — /board's shape
  "/deck",
  "/deck-login",
  "/api/decks",
  // the deck tool itself, served from public/tools
  "/tools",
  // The open, read-only board (app/board). Served in tracker mode too —
  // it is the one page most of essentia will ever open.
  "/board",
  "/api/wio-tracker",
  // The design team's own tracker — the WIO board's shape on the design
  // activity chart. Vishakha and her designers sign in at /deck-login.
  "/design-tracker",
  "/api/design-tracker",
  // One link per designer, in place of a password (db/053). The four sign in
  // to nothing else, and a password between a designer and her own board is
  // why the board went untouched (Monica, 19 Sep).
  "/my-tracker",
  // The five names on one page, at an address that does not change (Monica,
  // 21 Sep). Serving it is not the same as opening it: every route under
  // /design-team 404s unless DESIGN_TEAM_NAME_SIGNIN is "true".
  "/design-team",
  // Its 09:00 morning reminders, called by Vercel Cron (vercel.json).
  "/api/jobs/design-reminders",
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

// visibleNav() lives in components/shell/nav.ts — see the note above.
