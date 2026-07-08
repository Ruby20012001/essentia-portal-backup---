import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { entraProvider } from "@/lib/auth/providers/entra";
import { toErrorResponse } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

/**
 * Begins the Entra OIDC redirect. Fails loud (via the provider) when the
 * tenant is not configured — no silent fallback to password auth.
 */
export async function GET(request: NextRequest) {
  try {
    const state = randomBytes(16).toString("hex");
    const redirectUri = new URL("/api/auth/entra/callback", request.nextUrl.origin).toString();
    const url = entraProvider.authorizationUrl(state, redirectUri);
    const response = NextResponse.redirect(url);
    response.cookies.set({
      name: "entra_state",
      value: state,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 600,
    });
    return response;
  } catch (error) {
    return toErrorResponse(error);
  }
}
