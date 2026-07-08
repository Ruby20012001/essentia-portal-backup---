import { query } from "@/lib/db";
import { writeAudit } from "@/lib/services/audit";
import type { SessionUser } from "@/lib/auth/session";

/**
 * Configuration system (portal.app_config). Business rules live as data —
 * changing a threshold, provider, or blocked-department list is an UPDATE,
 * never a deploy. Values are JSONB; this layer adds a short in-process cache
 * so hot paths (permission logging, AI provider resolution) don't hit the
 * database per call.
 */

const CACHE_TTL_MS = 30_000;

const globalForConfig = globalThis as unknown as {
  essentiaConfig?: { loadedAt: number; values: Map<string, unknown> };
};

async function loadAll(): Promise<Map<string, unknown>> {
  const cached = globalForConfig.essentiaConfig;
  if (cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) {
    return cached.values;
  }
  const rows = await query<{ key: string; value: unknown }>(
    "SELECT key, value FROM portal.app_config",
  );
  const values = new Map(rows.map((r) => [r.key, r.value]));
  globalForConfig.essentiaConfig = { loadedAt: Date.now(), values };
  return values;
}

export async function getConfig<T>(key: string, fallback: T): Promise<T> {
  const values = await loadAll();
  return values.has(key) ? (values.get(key) as T) : fallback;
}

export function invalidateConfigCache(): void {
  globalForConfig.essentiaConfig = undefined;
}

/** Config changes are audited — who changed which rule, from what, to what. */
export async function setConfig(
  user: SessionUser,
  key: string,
  value: unknown,
): Promise<void> {
  const [previous] = await query<{ value: unknown }>(
    "SELECT value FROM portal.app_config WHERE key = $1",
    [key],
  );
  await query(
    `INSERT INTO portal.app_config (key, value, updated_by, updated_at)
     VALUES ($1, $2::jsonb, $3, NOW())
     ON CONFLICT (key) DO UPDATE
       SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
    [key, JSON.stringify(value), user.id],
  );
  invalidateConfigCache();
  await writeAudit({
    userId: user.id,
    role: user.accessLevel,
    action: "CONFIG_UPDATE",
    resourceType: "config",
    oldValues: previous ? { [key]: previous.value } : null,
    newValues: { [key]: value },
  });
}
