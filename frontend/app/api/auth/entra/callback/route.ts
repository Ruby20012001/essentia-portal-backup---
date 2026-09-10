import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { entraProvider } from "@/lib/auth/providers/entra";
import { createSession } from "@/lib/auth/sessions";
import { setSessionCookie } from "@/lib/auth/cookie";
import { clientIp, userAgent } from "@/lib/api/request";
import { homeHref } from "@/lib/portal-mode";

export const dynamic = "force-dynamic";

/**
 * Entra OIDC callback: validates state, exchanges the code, verifies the ID
 * token, maps it to a provisioned user, and mints a session.
 *
 * Failures land back on /login with a message rather than as raw JSON — this
 * URL is reached by a browser redirect, so a JSON error body would leave the
 * user staring at a blank page with no way back.
 */
function backToLogin(request: NextRequest, message: string): NextResponse {
  const url = new URL("/login", request.nextUrl.origin);
  url.searchParams.set("error", message);
  const response = NextResponse.redirect(url);
  response.cookies.delete("entra_state");
  return response;
}

export async function GET(request: NextRequest) {
  const error = request.nextUrl.searchParams.get("error");
  if (error) {
    // The user cancelled at Microsoft, or consent was refused.
    return backToLogin(
      request,
      request.nextUrl.searchParams.get("error_description") ?? "Sign-in was cancelled.",
    );
  }

  const code = request.nextUrl.searchParams.get("code");
  const returnedState = request.nextUrl.searchParams.get("state");
  const cookieState = cookies().get("entra_state")?.value;

  // The returned state is state.nonce.challenge; the cookie additionally holds
  // the PKCE verifier. Comparing the returned value against the cookie's first
  // three segments is the CSRF check.
  const expectedOutbound = cookieState?.split(".").slice(0, 3).join(".");
  if (!code || !returnedState || !cookieState || returnedState !== expectedOutbound) {
    return backToLogin(request, "Sign-in could not be verified. Please try again.");
  }

  try {
    const redirectUri = new URL("/api/auth/entra/callback", request.nextUrl.origin).toString();
    const user = await entraProvider.completeCallback({
      code,
      state: cookieState,
      redirectUri,
    });

    const { token, expiresAt } = await createSession(user, "entra", {
      userAgent: userAgent(request),
      ipAddress: clientIp(request),
    });

    const response = NextResponse.redirect(new URL(homeHref(), request.nextUrl.origin));
    setSessionCookie(response, token, expiresAt);
    response.cookies.delete("entra_state");
    return response;
  } catch (err) {
    return backToLogin(
      request,
      err instanceof Error ? err.message : "Sign-in failed. Please try again.",
    );
  }
}
