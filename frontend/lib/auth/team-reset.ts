import { query } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { can } from "@/lib/services/permissions";
import { writeAudit } from "@/lib/services/audit";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/change-password";
import type { SessionUser } from "@/lib/auth/session";

/**
 * A team lead resetting a colleague's password.
 *
 * This is the stand-in for "forgot password" until the portal can send email.
 * A reset link is only ever trying to establish that the person asking is who
 * they say; in a team of six, a lead who knows them answers that better than a
 * link does.
 *
 * The permission is its own resource (db/040, `user_password`) rather than
 * `users`.`edit`, so holding it grants exactly one verb and not the ability to
 * change someone's access level or department.
 *
 * Four refusals, none of them incidental:
 *
 *   · Outside your department, when your scope is own_dept. The permission row
 *     carries the scope and this reads it, rather than assuming a lead is a
 *     lead everywhere.
 *   · An Entra account. Its credential lives in Microsoft; writing a password
 *     here would open a second way in that bypasses the tenant's own rules.
 *   · Yourself. Not because it is dangerous — because "Reset password" in your
 *     own menu already does it properly, asking for the current one.
 *   · An inactive account. Someone who has left should not be given a way back.
 *
 * Every session the target has is revoked. Their old password is gone and
 * anything still signed in with it is a session nobody can now account for.
 */

export type Colleague = {
  id: string;
  name: string;
  email: string;
  jobTitle: string | null;
};

/** Who this person may reset — empty when they hold no such permission. */
export async function resettableColleagues(actor: SessionUser): Promise<Colleague[]> {
  const decision = await can(actor, "edit", "user_password");
  if (!decision.allowed) return [];

  // 'all' sees the portal; 'own_dept' sees their own team. Nothing here invents
  // a wider list than the permission row grants.
  const ownDeptOnly = decision.scope !== "all";
  if (ownDeptOnly && !actor.departmentId) return [];

  return query<Colleague>(
    `SELECT u.id, u.full_name AS name, u.email, u.job_title AS "jobTitle"
       FROM public.users u
      WHERE u.is_active
        AND u.auth_provider = 'local'
        AND u.id <> $1
        AND ($2::boolean IS FALSE OR u.department_id = $3)
      ORDER BY u.full_name`,
    [actor.id, ownDeptOnly, actor.departmentId],
  );
}

export type ResetResult =
  | { ok: true; name: string; sessionsEnded: number }
  | { ok: false; error: string };

export async function resetColleaguePassword(
  actor: SessionUser,
  targetId: string,
  newPassword: string,
): Promise<ResetResult> {
  const decision = await can(actor, "edit", "user_password");
  if (!decision.allowed) {
    return { ok: false, error: "You cannot reset passwords for other people." };
  }

  if (targetId === actor.id) {
    return {
      ok: false,
      error: "This is your own account — use Reset password in your own menu.",
    };
  }

  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return {
      ok: false,
      error: `The new password needs at least ${MIN_PASSWORD_LENGTH} characters.`,
    };
  }

  const [target] = await query<{
    id: string;
    full_name: string;
    auth_provider: string;
    department_id: string | null;
    is_active: boolean;
  }>(
    `SELECT id, full_name, auth_provider, department_id, is_active
       FROM public.users WHERE id = $1`,
    [targetId],
  );

  if (!target || !target.is_active) {
    return { ok: false, error: "That account is not active." };
  }

  if (decision.scope !== "all" && target.department_id !== actor.departmentId) {
    // Deliberately the same wording as a missing account: whether someone
    // exists in another department is not this person's business.
    return { ok: false, error: "That account is not active." };
  }

  if (target.auth_provider !== "local") {
    return {
      ok: false,
      error: `${target.full_name} signs in with Microsoft — that password is changed in their Microsoft account, not here.`,
    };
  }

  await query(
    `UPDATE public.users
        SET password_hash = $2, failed_logins = 0, locked_until = NULL, updated_at = NOW()
      WHERE id = $1`,
    [target.id, await hashPassword(newPassword)],
  );

  const ended = await query<{ id: string }>(
    `UPDATE portal.sessions
        SET revoked_at = NOW(), revoked_reason = 'admin'
      WHERE user_id = $1 AND revoked_at IS NULL
      RETURNING id`,
    [target.id],
  );

  // Who did it, to whom, and when — never what it was set to.
  await writeAudit({
    userId: actor.id,
    role: actor.accessLevel,
    action: "PASSWORD_RESET_FOR_COLLEAGUE",
    resourceType: "user_password",
    resourceId: target.id,
    newValues: { target: target.full_name, sessionsEnded: ended.length },
  });

  return { ok: true, name: target.full_name, sessionsEnded: ended.length };
}
