import { NextRequest, NextResponse } from "next/server";

/**
 * Route gate. Runs on the Edge runtime, so it cannot touch the database — it
 * only checks for the presence of the session cookie. Full validation (expiry,
 * revocation, idle) happens server-side in getCurrentUser() on every page and
 * API call, and the portal layout redirects anyone without a live session.
 *
 * SELF-CONTAINED ON PURPOSE — imports nothing but next/server.
 *
 * Vercel bundles middleware separately for the Edge runtime and it failed there
 * twice: first refusing the "@/" alias at build time, then failing at
 * invocation (MIDDLEWARE_INVOCATION_FAILED) with every route 500ing, while a
 * local production build served the same routes correctly. Rather than keep
 * guessing at a runtime we cannot reproduce, the handful of values this needs
 * are inlined. The Edge bundle now has no local module graph at all, which
 * removes the entire class of failure.
 *
 * The cost is duplication: SESSION_COOKIE and the tracker-mode prefixes also
 * live in lib/auth/constants.ts and lib/portal-mode.ts, which the app uses.
 * tests/unit/middleware-contract.test.ts asserts the two copies agree, so a
 * change to one that is not mirrored fails the suite rather than quietly
 * opening a route.
 */

/** Mirrors SESSION_COOKIE in lib/auth/constants.ts. */
const SESSION_COOKIE = "essentia_session";

/** Mirrors TRACKER_MODE_PREFIXES in lib/portal-mode.ts. */
const TRACKER_MODE_PREFIXES = [
  "/wio-tracker",
  "/api/wio-tracker",
  "/login",
  "/api/auth",
  "/api/me",
  "/notifications",
  "/api/notifications",
];

const PUBLIC_PREFIXES = ["/login", "/api/auth"];

function under(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Launch-mode gate. Runs BEFORE the dev-login shortcut on purpose: a
  // tracker-only deployment must serve only the tracker in development too, or
  // the mode is never exercised until it reaches production.
  //
  // Enforced here rather than only by hiding nav links, because an unlinked
  // route is not a closed one — anyone who types the URL reaches it.
  if (
    process.env.NEXT_PUBLIC_PORTAL_MODE === "tracker" &&
    !under(pathname, TRACKER_MODE_PREFIXES)
  ) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "This deployment serves the WIO to PIO Tracker only." },
        { status: 404 },
      );
    }
    return NextResponse.redirect(new URL("/wio-tracker", request.nextUrl.origin));
  }

  if (process.env.AUTH_ALLOW_DEV_LOGIN === "true") {
    return NextResponse.next();
  }

  if (under(pathname, PUBLIC_PREFIXES)) {
    return NextResponse.next();
  }

  if (request.cookies.get(SESSION_COOKIE)?.value) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const loginUrl = new URL("/login", request.nextUrl.origin);
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Everything except Next internals and static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|brand/).*)"],
};
