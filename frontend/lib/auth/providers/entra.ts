import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { query } from "@/lib/db";
import { writeAudit } from "@/lib/services/audit";
import { AuthProviderError } from "@/lib/auth/providers/types";
import { assertTenant, readIdentity } from "@/lib/auth/providers/entra-claims";
import type {
  AuthenticatedUser,
  RedirectAuthProvider,
} from "@/lib/auth/providers/types";

/**
 * Microsoft Entra ID (Azure AD) OIDC — the production identity source.
 *
 * Authorization-code flow with PKCE. The ID token is verified against the
 * tenant's published signing keys before any claim in it is believed:
 * signature, issuer, audience, expiry and nonce. That verification is done by
 * `jose`, not by hand — rolling RS256 and JWKS rotation yourself is how
 * authentication bypasses get written.
 *
 * The provider activates only when ENTRA_TENANT_ID / ENTRA_CLIENT_ID /
 * ENTRA_CLIENT_SECRET are all set, and fails loud otherwise. A misconfigured
 * deployment must never silently fall back to password auth.
 *
 * PROVISIONING IS THE GATE, NOT THE TENANT. A valid essentia Microsoft account
 * is necessary and NOT sufficient: sign-in must match an active row in
 * public.users. No account is ever created here. Without that rule every
 * employee in the directory would reach a board carrying live client names,
 * project scopes and internal delay attribution.
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

/**
 * One JWKS client per tenant, cached on globalThis. jose caches the fetched
 * keys and re-fetches on rotation; building a new client per sign-in would
 * hit Microsoft on every login and defeat that.
 */
const globalForJwks = globalThis as unknown as {
  entraJwks?: Map<string, ReturnType<typeof createRemoteJWKSet>>;
};

function jwks(tenantId: string) {
  globalForJwks.entraJwks ??= new Map();
  const existing = globalForJwks.entraJwks.get(tenantId);
  if (existing) return existing;
  const created = createRemoteJWKSet(
    new URL(`https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`),
  );
  globalForJwks.entraJwks.set(tenantId, created);
  return created;
}

async function exchangeCode(
  config: EntraConfig,
  code: string,
  redirectUri: string,
  codeVerifier: string,
): Promise<string> {
  const response = await fetch(
    `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
        scope: "openid profile email",
      }),
    },
  );

  const body = (await response.json().catch(() => ({}))) as {
    id_token?: string;
    error_description?: string;
    error?: string;
  };

  if (!response.ok || !body.id_token) {
    // Microsoft's error_description is the useful part (expired code, redirect
    // URI mismatch, bad secret) and is safe to surface: it describes the
    // deployment's configuration, not the user.
    throw new AuthProviderError(
      `Microsoft sign-in failed: ${
        body.error_description ?? body.error ?? `token endpoint returned ${response.status}`
      }`,
    );
  }
  return body.id_token;
}

export const entraProvider: RedirectAuthProvider = {
  name: "entra",
  kind: "redirect",

  authorizationUrl(state: string, redirectUri: string): string {
    const { tenantId, clientId } = readConfig();
    // state carries "<state>.<nonce>.<codeChallenge>" from the start route so
    // the callback can bind all three without extra cookies.
    const [, nonce, codeChallenge] = state.split(".");
    const params = new URLSearchParams({
      client_id: clientId,
      response_type: "code",
      redirect_uri: redirectUri,
      response_mode: "query",
      scope: "openid profile email",
      state,
    });
    if (nonce) params.set("nonce", nonce);
    if (codeChallenge) {
      params.set("code_challenge", codeChallenge);
      params.set("code_challenge_method", "S256");
    }
    return `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?${params}`;
  },

  async completeCallback({ code, state, redirectUri }): Promise<AuthenticatedUser> {
    const config = readConfig();
    const [, nonce, , codeVerifier] = state.split(".");
    if (!nonce || !codeVerifier) {
      throw new AuthProviderError("Sign-in request was malformed. Start again from the login page.");
    }

    const idToken = await exchangeCode(config, code, redirectUri, codeVerifier);

    // Everything below this line is only trustworthy because of this call.
    let payload: JWTPayload;
    try {
      ({ payload } = await jwtVerify(idToken, jwks(config.tenantId), {
        issuer: `https://login.microsoftonline.com/${config.tenantId}/v2.0`,
        audience: config.clientId,
        clockTolerance: 60,
      }));
    } catch (error) {
      throw new AuthProviderError(
        `Microsoft sign-in could not be verified: ${
          error instanceof Error ? error.message : "invalid token"
        }`,
      );
    }

    // Replay defence: the nonce ties this token to the browser that started
    // the flow. Without it a token captured elsewhere could be presented here.
    if (payload.nonce !== nonce) {
      throw new AuthProviderError("Sign-in could not be verified (nonce mismatch). Start again.");
    }

    assertTenant(payload, config.tenantId);
    const identity = readIdentity(payload);

    // Match on the immutable oid first; fall back to email only for an account
    // that has never signed in this way. NO ACCOUNT IS CREATED here.
    const [user] = await query<{
      id: string;
      name: string;
      access_level: AuthenticatedUser["accessLevel"];
      department_id: string | null;
      is_active: boolean;
      microsoft_oid: string | null;
    }>(
      `SELECT id, COALESCE(display_name, full_name) AS name, access_level,
              department_id, is_active, microsoft_oid
         FROM public.users
        WHERE microsoft_oid = $1 OR (microsoft_oid IS NULL AND lower(email) = $2)
        ORDER BY (microsoft_oid = $1) DESC
        LIMIT 1`,
      [identity.oid, identity.email],
    );

    if (!user) {
      await writeAudit({
        action: "AUTH_ENTRA_UNKNOWN_ACCOUNT",
        resourceType: "users",
        newValues: { email: identity.email, oid: identity.oid },
      });
      throw new AuthProviderError(
        "That Microsoft account is not set up for the portal. Ask your team lead to have it added.",
      );
    }

    if (!user.is_active) {
      await writeAudit({
        userId: user.id,
        action: "AUTH_ENTRA_INACTIVE_ACCOUNT",
        resourceType: "users",
        resourceId: user.id,
      });
      throw new AuthProviderError("That account is no longer active.");
    }

    // Bind the oid on first sign-in so later logins match on it rather than on
    // an email that may change. Also the point at which the exit protocol's
    // is_active flag becomes the only thing standing between a leaver and the
    // portal, which is why the check above runs first.
    if (!user.microsoft_oid) {
      await query(`UPDATE public.users SET microsoft_oid = $1 WHERE id = $2`, [
        identity.oid,
        user.id,
      ]);
    }
    await query(`UPDATE public.users SET last_login = NOW() WHERE id = $1`, [user.id]);

    return {
      id: user.id,
      name: user.name,
      accessLevel: user.access_level,
      departmentId: user.department_id,
      authProvider: "entra",
    };
  },
};
