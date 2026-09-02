import { AuthProviderError } from "@/lib/auth/providers/types";

/**
 * Entra ID token claims → the identity the portal will look up.
 *
 * Pure, so it can be tested without a tenant: this is the half of the OIDC
 * flow that decides WHO signed in, and it is the half most likely to be got
 * subtly wrong. The crypto half (signature, issuer, audience, expiry, nonce)
 * is delegated to `jose` in entra.ts — never hand-rolled.
 */

/**
 * The subset of the ID token the portal reads. Everything else is ignored.
 * The index signature is what lets a verified `JWTPayload` be passed straight
 * in — Entra sends many more claims than these, and they are none of our
 * business.
 */
export type EntraClaims = {
  /** Immutable per-user object id within the tenant. The durable key. */
  oid?: unknown;
  tid?: unknown;
  email?: unknown;
  preferred_username?: unknown;
  upn?: unknown;
  name?: unknown;
  [claim: string]: unknown;
};

export type EntraIdentity = {
  /** users.microsoft_oid — stable across email changes, so it is the anchor. */
  oid: string;
  /** Lower-cased. Only used to find an account the first time. */
  email: string;
  displayName: string | null;
};

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/**
 * Reads the identity out of validated claims.
 *
 * `oid` is required and is the durable key: Entra guarantees it is immutable
 * for the life of the account, whereas email and UPN can both change. Matching
 * on email alone would silently follow a rename onto whoever inherits the old
 * address.
 *
 * Email is taken from `email`, falling back to `preferred_username` then `upn`,
 * because which of the three is populated depends on how the tenant is
 * configured and whether the `email` optional claim was added to the app
 * registration. It is only ever used to find an account that has not yet been
 * linked to an oid.
 *
 * Throws rather than returning null: a token that validated cryptographically
 * but carries no usable identity is a misconfigured app registration, and
 * saying so beats a generic "sign-in failed".
 */
export function readIdentity(claims: EntraClaims): EntraIdentity {
  const oid = str(claims.oid);
  if (!oid) {
    throw new AuthProviderError(
      "Microsoft sign-in returned no user id (oid) claim. The app registration " +
        "must request the 'profile' scope.",
    );
  }

  const email =
    str(claims.email) ?? str(claims.preferred_username) ?? str(claims.upn);
  if (!email) {
    throw new AuthProviderError(
      "Microsoft sign-in returned no email claim. Add the optional 'email' " +
        "claim to the app registration, or grant the 'email' scope.",
    );
  }

  return { oid, email: email.toLowerCase(), displayName: str(claims.name) };
}

/**
 * Confirms the token was issued by OUR tenant.
 *
 * Single-tenant registrations are configured to refuse other directories, but
 * this is checked here as well because that setting is a property of the app
 * registration — someone can change it in the portal without touching this
 * code, and the failure mode is silent: outside accounts would start being
 * accepted. Defence that costs one comparison is worth keeping.
 */
export function assertTenant(claims: EntraClaims, expectedTenantId: string): void {
  const tid = str(claims.tid);
  if (!tid || tid.toLowerCase() !== expectedTenantId.toLowerCase()) {
    throw new AuthProviderError(
      "That Microsoft account belongs to a different organisation.",
    );
  }
}
