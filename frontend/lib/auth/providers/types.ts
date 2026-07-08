import type { SessionUser } from "@/lib/auth/session";

/**
 * Auth provider abstraction (foundation pattern): the app depends on this
 * interface, never on a vendor. Providers register in lib/auth/providers;
 * the active one is chosen by config `auth.provider`.
 *
 * - Credential providers (local password) authenticate synchronously and
 *   return the user.
 * - Redirect providers (Entra OIDC) authenticate via browser redirect; they
 *   expose authorizationUrl() + completeCallback() instead.
 */
export type AuthenticatedUser = SessionUser & { authProvider: string };

export interface CredentialAuthProvider {
  readonly name: string;
  readonly kind: "credential";
  authenticate(input: {
    email: string;
    password: string;
  }): Promise<AuthenticatedUser | null>;
}

export interface RedirectAuthProvider {
  readonly name: string;
  readonly kind: "redirect";
  authorizationUrl(state: string, redirectUri: string): string;
  completeCallback(input: {
    code: string;
    state: string;
    redirectUri: string;
  }): Promise<AuthenticatedUser>;
}

export type AuthProvider = CredentialAuthProvider | RedirectAuthProvider;

export class AuthProviderError extends Error {
  readonly status = 401;
  constructor(message: string) {
    super(message);
    this.name = "AuthProviderError";
  }
}
