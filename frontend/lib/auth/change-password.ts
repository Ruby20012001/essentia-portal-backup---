import { query } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { writeAudit } from "@/lib/services/audit";
import type { ResolvedSession } from "@/lib/auth/session";

/**
 * Letting people change their own password.
 *
 * Until now every password went through db/set-team-passwords.mjs and a paste
 * into the SQL editor — which meant one person was the password desk for the
 * whole team, and nobody could change theirs without asking her. That is not a
 * missing screen so much as a missing idea: a credential the holder cannot
 * change is not really theirs.
 *
 * Deliberate choices, each because the obvious alternative is worse:
 *
 *   · The current password is required. Without it, anyone who finds a signed-in
 *     screen unattended could take the account over silently — and a shared
 *     office machine is exactly where that happens.
 *
 *   · Entra accounts are refused rather than quietly given a password. Their
 *     credential lives in Microsoft; writing one here would create a second way
 *     in that bypasses whatever the tenant enforces (db/037 says the same).
 *
 *   · Every OTHER session is revoked, and the current one is kept. Someone
 *     changes their password precisely when they think it is compromised, so the
 *     act must end any session that password opened — while not logging out the
 *     person doing it, which would read as failure.
 *
 *   · The audit records that it happened and never what changed. old_values /
 *     new_values would put password material in an immutable log.
 */

export const MIN_PASSWORD_LENGTH = 8;

export type ChangeResult =
  | { ok: true; otherSessionsEnded: number }
  | { ok: false; error: string };

export async function changeOwnPassword(
  session: ResolvedSession,
  currentPassword: string,
  newPassword: string,
): Promise<ChangeResult> {
  const [account] = await query<{ password_hash: string | null; auth_provider: string }>(
    `SELECT password_hash, auth_provider FROM public.users WHERE id = $1 AND is_active`,
    [session.user.id],
  );

  if (!account) {
    return { ok: false, error: "This account is no longer active." };
  }

  if (account.auth_provider !== "local") {
    return {
      ok: false,
      error:
        "This account signs in with Microsoft, so it has no portal password to change. " +
        "Change it in your Microsoft account instead.",
    };
  }

  if (!(await verifyPassword(currentPassword, account.password_hash))) {
    await writeAudit({
      userId: session.user.id,
      role: session.user.accessLevel,
      action: "PASSWORD_CHANGE_REFUSED",
      resourceType: "users",
      resourceId: session.user.id,
      newValues: { reason: "current password did not match" },
    });
    return { ok: false, error: "Your current password is not right." };
  }

  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return {
      ok: false,
      error: `The new password needs at least ${MIN_PASSWORD_LENGTH} characters.`,
    };
  }

  if (newPassword === currentPassword) {
    return { ok: false, error: "The new password is the same as the old one." };
  }

  const hash = await hashPassword(newPassword);

  await query(
    `UPDATE public.users
        SET password_hash = $2, failed_logins = 0, locked_until = NULL, updated_at = NOW()
      WHERE id = $1`,
    [session.user.id, hash],
  );

  // Everywhere the old password is still signed in, but not here.
  const ended = await query<{ id: string }>(
    `UPDATE portal.sessions
        SET revoked_at = NOW(), revoked_reason = 'admin'
      WHERE user_id = $1 AND id <> $2 AND revoked_at IS NULL
      RETURNING id`,
    [session.user.id, session.sessionId],
  );

  await writeAudit({
    userId: session.user.id,
    role: session.user.accessLevel,
    action: "PASSWORD_CHANGED",
    resourceType: "users",
    resourceId: session.user.id,
    // What happened, never what it changed to.
    newValues: { otherSessionsEnded: ended.length },
  });

  return { ok: true, otherSessionsEnded: ended.length };
}
