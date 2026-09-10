import { NextRequest, NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { entraProvider } from "@/lib/auth/providers/entra";
import { toErrorResponse } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

/**
 * Begins the Entra OIDC redirect. Fails loud (via the provider) when the
 * tenant is not configured — no silent fallback to password auth.
 *
 * Three secrets are minted here and all three are held in one httpOnly cookie,
 * never in the URL:
 *   state         CSRF — the callback refuses a response that does not carry it
 *   nonce         replay — binds the returned ID token to this browser
 *   code_verifier PKCE — proves the code is redeemed by whoever requested it
 *
 * Only the state and the code CHALLENGE (a hash) travel to Microsoft. The
 * verifier stays on this side, which is the whole point of PKCE.
 */
function b64url(buffer: Buffer): string {
  return buffer.toString("base64url");
}

export async function GET(request: NextRequest) {
  try {
    const state = b64url(randomBytes(16));
    const nonce = b64url(randomBytes(16));
    const codeVerifier = b64url(randomBytes(32));
    const codeChallenge = b64url(createHash("sha256").update(codeVerifier).digest());

    const redirectUri = new URL("/api/auth/entra/callback", request.nextUrl.origin).toString();

    // What Microsoft sees: state + nonce + challenge. The verifier is appended
    // only to the cookie copy below.
    const outbound = [state, nonce, codeChallenge].join(".");
    const url = entraProvider.authorizationUrl(outbound, redirectUri);

    const response = NextResponse.redirect(url);
    response.cookies.set({
      name: "entra_state",
      value: [state, nonce, codeChallenge, codeVerifier].join("."),
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
