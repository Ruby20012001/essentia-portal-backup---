import { createHash, randomBytes } from "node:crypto";
import { query } from "@/lib/db";
import { getConfig } from "@/lib/services/config";
import { writeAudit } from "@/lib/services/audit";
import { SESSION_COOKIE } from "@/lib/auth/constants";
import type { SessionUser } from "@/lib/auth/session";

/**
 * Server-side session store. The cookie carries an opaque 256-bit token;
 * only its SHA-256 is persisted, so a DB leak yields no usable tokens.
 * Enforces absolute + idle timeout, a concurrent-session cap, and device
 * tracking, and audits every lifecycle event (LOGIN / LOGOUT / SESSION_EXPIRE).
 */

export { SESSION_COOKIE };

export type SessionContext = {
  userAgent?: string | null;
  ipAddress?: string | null;
};

export type ActiveSession = {
  id: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  userAgent: string | null;
  ipAddress: string | null;
  deviceLabel: string | null;
  current: boolean;
};

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Coarse device label from the UA string — for the "your sessions" list. */
function deviceLabel(userAgent?: string | null): string | null {
  if (!userAgent) return null;
  const ua = userAgent.toLowerCase();
  const os = ua.includes("windows")
    ? "Windows"
    : ua.includes("mac")
      ? "macOS"
      : ua.includes("android")
        ? "Android"
        : ua.includes("iphone") || ua.includes("ipad")
          ? "iOS"
          : ua.includes("linux")
            ? "Linux"
            : "Unknown OS";
  const browser = ua.includes("edg")
    ? "Edge"
    : ua.includes("chrome")
      ? "Chrome"
      : ua.includes("firefox")
        ? "Firefox"
        : ua.includes("safari")
          ? "Safari"
          : "browser";
  return `${browser} · ${os}`;
}

/**
 * Creates a session, enforcing the concurrent-session cap (oldest revoked
 * past the limit). Returns the RAW token for the cookie — never stored.
 */
export async function createSession(
  user: SessionUser,
  authProvider: string,
  ctx: SessionContext,
): Promise<{ token: string; sessionId: string; expiresAt: string }> {
  const absoluteMinutes = await getConfig<number>("auth.session_absolute_minutes", 480);
  const maxConcurrent = await getConfig<number>("auth.max_concurrent_sessions", 3);

  const token = randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);

  const [row] = await query<{ id: string; expires_at: string }>(
    `INSERT INTO portal.sessions
       (user_id, token_hash, auth_provider, user_agent, ip_address, device_label, expires_at)
     VALUES ($1, $2, $3, $4, $5::INET, $6, NOW() + ($7 || ' minutes')::INTERVAL)
     RETURNING id, expires_at::TEXT`,
    [
      user.id,
      tokenHash,
      authProvider,
      ctx.userAgent ?? null,
      ctx.ipAddress ?? null,
      deviceLabel(ctx.userAgent),
      String(absoluteMinutes),
    ],
  );

  // Concurrent cap: revoke the oldest active sessions beyond the limit.
  await query(
    `UPDATE portal.sessions
     SET revoked_at = NOW(), revoked_reason = 'concurrent'
     WHERE user_id = $1 AND revoked_at IS NULL
       AND id NOT IN (
         SELECT id FROM portal.sessions
         WHERE user_id = $1 AND revoked_at IS NULL
         ORDER BY created_at DESC
         LIMIT $2
       )`,
    [user.id, maxConcurrent],
  );

  await writeAudit({
    userId: user.id,
    role: user.accessLevel,
    action: "LOGIN",
    resourceType: "users",
    resourceId: user.id,
    newValues: { sessionId: row.id, authProvider, device: deviceLabel(ctx.userAgent) },
  });

  return { token, sessionId: row.id, expiresAt: row.expires_at };
}

export type ValidatedSession = { user: SessionUser; sessionId: string };

/**
 * Validates a raw token: not revoked, not past absolute expiry, not idle
 * beyond the idle timeout. Touches last_seen_at on success. On idle/expiry
 * it revokes the row and audits SESSION_EXPIRE, then returns null.
 */
export async function validateSession(
  token: string,
): Promise<ValidatedSession | null> {
  const idleMinutes = await getConfig<number>("auth.session_idle_minutes", 60);
  const tokenHash = hashToken(token);

  const [row] = await query<{
    id: string;
    user_id: string;
    access_level: SessionUser["accessLevel"];
    department_id: string | null;
    name: string;
    is_active: boolean;
    expired: boolean;
    idle: boolean;
  }>(
    `SELECT s.id, s.user_id, u.access_level, u.department_id,
            COALESCE(u.display_name, u.full_name) AS name, u.is_active,
            (s.expires_at <= NOW()) AS expired,
            (s.last_seen_at < NOW() - ($2 || ' minutes')::INTERVAL) AS idle
     FROM portal.sessions s
     JOIN public.users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.revoked_at IS NULL`,
    [tokenHash, String(idleMinutes)],
  );

  if (!row) return null;

  if (row.expired || row.idle || !row.is_active) {
    const reason = !row.is_active ? "admin" : row.expired ? "expired" : "idle";
    await query(
      `UPDATE portal.sessions SET revoked_at = NOW(), revoked_reason = $2 WHERE id = $1`,
      [row.id, reason],
    );
    await writeAudit({
      userId: row.user_id,
      role: row.access_level,
      action: "SESSION_EXPIRE",
      resourceType: "users",
      resourceId: row.user_id,
      newValues: { sessionId: row.id, reason },
    });
    return null;
  }

  await query(`UPDATE portal.sessions SET last_seen_at = NOW() WHERE id = $1`, [row.id]);

  return {
    sessionId: row.id,
    user: {
      id: row.user_id,
      name: row.name,
      accessLevel: row.access_level,
      departmentId: row.department_id,
    },
  };
}

export async function revokeSessionByToken(
  token: string,
  reason: "logout" | "admin" = "logout",
): Promise<void> {
  const tokenHash = hashToken(token);
  const [row] = await query<{ id: string; user_id: string }>(
    `UPDATE portal.sessions
     SET revoked_at = NOW(), revoked_reason = $2
     WHERE token_hash = $1 AND revoked_at IS NULL
     RETURNING id, user_id`,
    [tokenHash, reason],
  );
  if (row) {
    await writeAudit({
      userId: row.user_id,
      action: "LOGOUT",
      resourceType: "users",
      resourceId: row.user_id,
      newValues: { sessionId: row.id, reason },
    });
  }
}

/** Concurrent-session control: the user's own active sessions. */
export async function listUserSessions(
  user: SessionUser,
  currentSessionId: string | null,
): Promise<ActiveSession[]> {
  const rows = await query<{
    id: string;
    created_at: string;
    last_seen_at: string;
    expires_at: string;
    user_agent: string | null;
    ip_address: string | null;
    device_label: string | null;
  }>(
    `SELECT id, created_at::TEXT, last_seen_at::TEXT, expires_at::TEXT,
            user_agent, ip_address::TEXT, device_label
     FROM portal.sessions
     WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > NOW()
     ORDER BY last_seen_at DESC`,
    [user.id],
  );
  return rows.map((r) => ({
    id: r.id,
    createdAt: r.created_at,
    lastSeenAt: r.last_seen_at,
    expiresAt: r.expires_at,
    userAgent: r.user_agent,
    ipAddress: r.ip_address,
    deviceLabel: r.device_label,
    current: r.id === currentSessionId,
  }));
}

/** Revoke one of the user's own sessions by id (sign out a device). */
export async function revokeSessionById(
  user: SessionUser,
  sessionId: string,
): Promise<boolean> {
  const rows = await query<{ id: string }>(
    `UPDATE portal.sessions
     SET revoked_at = NOW(), revoked_reason = 'admin'
     WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL
     RETURNING id`,
    [sessionId, user.id],
  );
  if (rows.length > 0) {
    await writeAudit({
      userId: user.id,
      role: user.accessLevel,
      action: "SESSION_REVOKE",
      resourceType: "users",
      resourceId: user.id,
      newValues: { sessionId },
    });
  }
  return rows.length > 0;
}
