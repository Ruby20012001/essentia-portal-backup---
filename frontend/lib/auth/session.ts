import { cookies } from "next/headers";
import { getUserById } from "@/lib/services/users";
import { AuthError } from "@/lib/auth/errors";
import { SESSION_COOKIE, validateSession } from "@/lib/auth/sessions";

export type SessionUser = {
  id: string;
  name: string;
  accessLevel: "L0" | "L1" | "L2" | "L3";
  departmentId: string | null;
};

export type ResolvedSession = { user: SessionUser; sessionId: string };

/** Dev bootstrap is a config-gated convenience, OFF in production. */
function devLoginAllowed(): boolean {
  return process.env.AUTH_ALLOW_DEV_LOGIN === "true";
}

/**
 * Resolves the acting session from the httpOnly cookie. Returns null when
 * unauthenticated.
 *
 * Dev fallback (only when AUTH_ALLOW_DEV_LOGIN=true): if there is no session
 * cookie but DEV_USER_ID is set, act as that user without a real session —
 * keeps local iteration and the preview smooth. In production this branch is
 * dead, so the portal depends entirely on real sessions. Either way, access
 * level and department come from public.users, never from the client.
 */
export async function getSession(): Promise<ResolvedSession | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (token) {
    const validated = await validateSession(token);
    if (validated) return validated;
  }

  if (devLoginAllowed() && process.env.DEV_USER_ID) {
    const user = await getUserById(process.env.DEV_USER_ID);
    if (user && user.isActive) {
      return {
        sessionId: "dev",
        user: {
          id: user.id,
          name: user.name,
          accessLevel: user.accessLevel,
          departmentId: user.departmentId,
        },
      };
    }
  }

  return null;
}

/** The acting user, or a 401 AuthError. */
export async function getCurrentUser(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) throw new AuthError();
  return session.user;
}

/** User + session id, for routes that manage the session (logout, list). */
export async function getCurrentSession(): Promise<ResolvedSession> {
  const session = await getSession();
  if (!session) throw new AuthError();
  return session;
}
