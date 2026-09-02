import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/constants";
import { homeHref, isRouteAllowed, portalMode } from "@/lib/portal-mode";

/**
 * Route gate. Runs on the Edge runtime, so it cannot touch the database —
 * it only checks for the presence of the session cookie. Full validation
 * (expiry, revocation, idle) happens server-side in getCurrentUser() on
 * every page and API call.
 *
 * When AUTH_ALLOW_DEV_LOGIN=true (development), the gate is permissive so the
 * DEV_USER_ID fallback keeps local work and the preview smooth. In production
 * (dev login off) it redirects unauthenticated page requests to /login and
 * returns 401 for unauthenticated API calls.
 */

const PUBLIC_PREFIXES = ["/login", "/api/auth"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Launch-mode gate. Runs BEFORE the dev-login shortcut on purpose: a
  // tracker-only deployment must serve only the tracker in development too,
  // or the mode is never actually exercised until it reaches production.
  //
  // Enforced here rather than only by hiding nav links, because an unlinked
  // route is not a closed one — anyone who types the URL reaches it.
  const mode = portalMode();
  if (mode !== "full" && !isRouteAllowed(pathname, mode)) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "This deployment serves the WIO → PIO Tracker only." },
        { status: 404 },
      );
    }
    return NextResponse.redirect(new URL(homeHref(mode), request.nextUrl.origin));
  }

  if (process.env.AUTH_ALLOW_DEV_LOGIN === "true") {
    return NextResponse.next();
  }

  if (PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  const hasCookie = Boolean(request.cookies.get(SESSION_COOKIE)?.value);
  if (hasCookie) return NextResponse.next();

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
