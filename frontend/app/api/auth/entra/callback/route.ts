import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { entraProvider } from "@/lib/auth/providers/entra";
import { createSession } from "@/lib/auth/sessions";
import { setSessionCookie } from "@/lib/auth/cookie";
import { clientIp, userAgent } from "@/lib/api/request";
import { toErrorResponse } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

/**
 * Entra OIDC callback. Validates state, exchanges the code, maps claims to a
 * user, and mints a session. completeCallback() fails loud until the tenant
 * exists (A-16); the plumbing around it is complete.
 */
export async function GET(request: NextRequest) {
  try {
    const code = request.nextUrl.searchParams.get("code");
    const state = request.nextUrl.searchParams.get("state");
    const expectedState = cookies().get("entra_state")?.value;
    if (!code || !state || !expectedState || state !== expectedState) {
      return NextResponse.json({ error: "Invalid OAuth state" }, { status: 400 });
    }

    const redirectUri = new URL("/api/auth/entra/callback", request.nextUrl.origin).toString();
    const user = await entraProvider.completeCallback({ code, state, redirectUri });

    const { token, expiresAt } = await createSession(user, "entra", {
      userAgent: userAgent(request),
      ipAddress: clientIp(request),
    });
    const response = NextResponse.redirect(new URL("/dashboard", request.nextUrl.origin));
    setSessionCookie(response, token, expiresAt);
    response.cookies.delete("entra_state");
    return response;
  } catch (error) {
    return toErrorResponse(error);
  }
}
