import { withUserContext } from "@/lib/db";
import type { SessionUser } from "@/lib/auth/session";
import { getConfig } from "@/lib/services/config";
import type { ApiName, FailureState, LatestCheck, Wiring } from "@/lib/services/api-health-logic";

/**
 * S13 · API Health — the latest logged check per integration, the failure
 * streaks, and today's uptime from portal.api_health_log. Read-only.
 *
 * Wiring is read from the portal's own setup: which Keka provider is
 * configured, and whether an Anthropic key is present. Only the fact that a
 * setting exists is used; no value is read into the page.
 */

export type ApiHealth = {
  checks: LatestCheck[];
  failures: FailureState[];
  today: { total: number; healthy: number };
  wiring: Partial<Record<ApiName, Wiring>>;
};

async function portalWiring(): Promise<Partial<Record<ApiName, Wiring>>> {
  const keka = await getConfig<string>("keka.provider", "fixture");
  return {
    keka:
      keka === "http"
        ? process.env.KEKA_BASE_URL && process.env.KEKA_API_KEY
          ? "Live"
          : "Not configured"
        : "Test data",
    anthropic: process.env.ANTHROPIC_API_KEY ? "Live" : "Not configured",
  };
}

export async function getApiHealth(user: SessionUser): Promise<ApiHealth> {
  const data = await withUserContext(user, async (q) => {
    const checks = await q<LatestCheck>(
      `SELECT DISTINCT ON (integration)
              integration::text AS integration, status,
              checked_at::text AS "checkedAt", response_ms AS "responseMs", error_msg AS error
         FROM portal.api_health_log
        ORDER BY integration, checked_at DESC`,
    );
    const failures = await q<FailureState>(
      `SELECT integration::text AS integration,
              COALESCE(consecutive_failures, 0)::int AS "consecutiveFailures",
              first_failure_at::text AS "firstFailureAt",
              COALESCE(is_degraded, FALSE) AS degraded
         FROM portal.api_failure_state
        WHERE resolved_at IS NULL`,
    );
    const [today] = await q<{ total: number; healthy: number }>(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE status = 'healthy')::int AS healthy
         FROM portal.api_health_log
        WHERE checked_at >= date_trunc('day', NOW() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata'`,
    );
    return { checks, failures, today: today ?? { total: 0, healthy: 0 } };
  });
  return { ...data, wiring: await portalWiring() };
}
