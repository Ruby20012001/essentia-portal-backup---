import { AuthProviderError } from "@/lib/auth/providers/types";
import type {
  AuthenticatedUser,
  RedirectAuthProvider,
} from "@/lib/auth/providers/types";

/**
 * Microsoft Entra ID (Azure AD) OIDC provider — the PRODUCTION identity
 * source. The authorization-code flow is scaffolded here; it activates when
 * the tenant env vars are set (ENTRA_TENANT_ID / ENTRA_CLIENT_ID /
 * ENTRA_CLIENT_SECRET). Without them it fails loudly rather than silently
 * degrading — a misconfigured deploy must not fall back to local passwords.
 *
 * PENDING (needs a real tenant to build + test): ID-token signature
 * validation against the tenant JWKS, nonce/PKCE, and mapping Entra claims
 * (oid, email, groups) to public.users.microsoft_oid. See
 * docs/ASSUMPTIONS_DECISIONS.md A-16.
 */

type EntraConfig = {
  tenantId: string;
  clientId: string;
  clientSecret: string;
};

function readConfig(): EntraConfig {
  const tenantId = process.env.ENTRA_TENANT_ID;
  const clientId = process.env.ENTRA_CLIENT_ID;
  const clientSecret = process.env.ENTRA_CLIENT_SECRET;
  if (!tenantId || !clientId || !clientSecret) {
    throw new AuthProviderError(
      "Entra ID is selected as the auth provider but the tenant is not " +
        "configured. Set ENTRA_TENANT_ID / ENTRA_CLIENT_ID / " +
        "ENTRA_CLIENT_SECRET (see frontend/.env.example), or set config " +
        "auth.provider to 'local' for development.",
    );
  }
  return { tenantId, clientId, clientSecret };
}

export const entraProvider: RedirectAuthProvider = {
  name: "entra",
  kind: "redirect",

  authorizationUrl(state: string, redirectUri: string): string {
    const { tenantId, clientId } = readConfig();
    const params = new URLSearchParams({
      client_id: clientId,
      response_type: "code",
      redirect_uri: redirectUri,
      response_mode: "query",
      scope: "openid profile email",
      state,
    });
    return `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?${params}`;
  },

  async completeCallback(): Promise<AuthenticatedUser> {
    readConfig();
    // Token exchange + JWKS signature validation + claims→user mapping land
    // with the real tenant. Failing loud until then is intentional.
    throw new AuthProviderError(
      "Entra callback handling is not yet implemented — awaiting a tenant to " +
        "build and test token validation against. Tracked as A-16.",
    );
  },
};
