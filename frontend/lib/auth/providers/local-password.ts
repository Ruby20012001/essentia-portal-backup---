import { query } from "@/lib/db";
import { getConfig } from "@/lib/services/config";
import { verifyPassword } from "@/lib/auth/password";
import { writeAudit } from "@/lib/services/audit";
import { AccountLockedError } from "@/lib/auth/errors";
import type {
  AuthenticatedUser,
  CredentialAuthProvider,
} from "@/lib/auth/providers/types";

/**
 * Local password provider — real scrypt verification against
 * users.password_hash. Backs development and break-glass access; production
 * identities come from Entra. Includes lockout after repeated failures.
 * Returns null on bad credentials (the caller maps that to a generic 401 so
 * we never reveal whether the email exists).
 */
export const localPasswordProvider: CredentialAuthProvider = {
  name: "local",
  kind: "credential",

  async authenticate({ email, password }): Promise<AuthenticatedUser | null> {
    const [row] = await query<{
      id: string;
      name: string;
      access_level: AuthenticatedUser["accessLevel"];
      department_id: string | null;
      password_hash: string | null;
      is_active: boolean;
      locked_until: string | null;
    }>(
      `SELECT id, COALESCE(display_name, full_name) AS name, access_level,
              department_id, password_hash, is_active, locked_until::TEXT
       FROM public.users
       WHERE lower(email) = lower($1)`,
      [email],
    );

    if (!row || !row.is_active || !row.password_hash) return null;

    if (row.locked_until && new Date(row.locked_until) > new Date()) {
      throw new AccountLockedError(
        "Account temporarily locked after repeated failed sign-ins. Try again later.",
      );
    }

    const ok = await verifyPassword(password, row.password_hash);
    if (!ok) {
      await registerFailure(row.id);
      return null;
    }

    // Success clears the failure counter and lock.
    await query(
      `UPDATE public.users
       SET failed_logins = 0, locked_until = NULL, last_login = NOW()
       WHERE id = $1`,
      [row.id],
    );

    return {
      id: row.id,
      name: row.name,
      accessLevel: row.access_level,
      departmentId: row.department_id,
      authProvider: "local",
    };
  },
};

async function registerFailure(userId: string): Promise<void> {
  const threshold = await getConfig<number>("auth.lockout_threshold", 5);
  const lockoutMinutes = await getConfig<number>("auth.lockout_minutes", 15);
  const [row] = await query<{ failed_logins: number }>(
    `UPDATE public.users
     SET failed_logins = failed_logins + 1
     WHERE id = $1
     RETURNING failed_logins`,
    [userId],
  );
  if (row && row.failed_logins >= threshold) {
    await query(
      `UPDATE public.users
       SET locked_until = NOW() + ($2 || ' minutes')::INTERVAL, failed_logins = 0
       WHERE id = $1`,
      [userId, String(lockoutMinutes)],
    );
    await writeAudit({
      userId,
      action: "ACCOUNT_LOCKED",
      resourceType: "users",
      resourceId: userId,
      newValues: { lockoutMinutes, threshold },
    });
  }
}
