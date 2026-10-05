import Anthropic from "@anthropic-ai/sdk";
import { query } from "@/lib/db";
import type { SessionUser } from "@/lib/auth/session";
import { publishEvent } from "@/lib/notifications";
import type { ApiName } from "@/lib/services/api-health-logic";
import {
  classify,
  errorText,
  nextStreak,
  RETAIN_DAYS,
  type ProbeOutcome,
  type StreakState,
} from "@/lib/services/api-health-pulse-logic";

/**
 * The five-minute pulse behind S13 (scheduler job 'api-health-pulse', db/061).
 *
 * Only an integration the portal can actually reach is probed. Today that is
 * Anthropic, when a key is configured. Everything else is skipped and writes
 * nothing, so S13 keeps saying "Never checked" for it rather than recording a
 * "down" for something that was never built. A new integration earns a probe
 * here when its connection exists.
 */

const PROBE_TIMEOUT_MS = 10_000;

type Probe = () => Promise<ProbeOutcome>;

/** The cheapest authenticated call: fetch one model's metadata. No tokens are spent. */
async function probeAnthropic(): Promise<ProbeOutcome> {
  const client = new Anthropic();
  const started = Date.now();
  try {
    await client.models.retrieve("claude-opus-5-5", null, { timeout: PROBE_TIMEOUT_MS, maxRetries: 0 });
    return { kind: "ok", ms: Date.now() - started };
  } catch (error) {
    const ms = Date.now() - started;
    if (error instanceof Anthropic.APIConnectionError) {
      return { kind: "network", ms: null, message: error.message };
    }
    if (error instanceof Anthropic.APIError && typeof error.status === "number") {
      return { kind: "http", ms, status: error.status, message: error.message };
    }
    return { kind: "network", ms: null, message: error instanceof Error ? error.message : String(error) };
  }
}

/** Which integrations have a probe right now. Read at run time, so setting a key turns its probe on. */
function activeProbes(): Partial<Record<ApiName, Probe>> {
  return {
    ...(process.env.ANTHROPIC_API_KEY ? { anthropic: probeAnthropic } : {}),
  };
}

export type PulseResult = {
  checked: { integration: ApiName; status: string; ms: number | null }[];
  skipped: number;
  purged: number;
};

export async function runApiHealthPulse(actor: SessionUser): Promise<PulseResult> {
  const probes = activeProbes();
  const checked: PulseResult["checked"] = [];

  for (const [name, probe] of Object.entries(probes) as [ApiName, Probe][]) {
    const outcome = await probe();
    const status = classify(outcome);
    const ms = outcome.ms;
    const now = new Date().toISOString();

    const [prev] = await query<StreakState>(
      `SELECT COALESCE(consecutive_failures, 0)::int AS "consecutiveFailures",
              first_failure_at::text AS "firstFailureAt",
              COALESCE(is_degraded, FALSE) AS degraded
         FROM portal.api_failure_state WHERE integration = $1`,
      [name],
    );
    const streak = nextStreak(prev ?? null, status, now);

    await query(
      `INSERT INTO portal.api_health_log (integration, checked_at, status, response_ms, error_msg, alert_sent)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [name, now, status, ms, errorText(outcome), streak.justDegraded],
    );

    await query(
      `INSERT INTO portal.api_failure_state
         (integration, consecutive_failures, first_failure_at, last_checked_at, is_degraded, resolved_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (integration) DO UPDATE SET
         consecutive_failures = EXCLUDED.consecutive_failures,
         first_failure_at     = EXCLUDED.first_failure_at,
         last_checked_at      = EXCLUDED.last_checked_at,
         is_degraded          = EXCLUDED.is_degraded,
         resolved_at          = CASE WHEN $7 THEN EXCLUDED.last_checked_at
                                     WHEN EXCLUDED.consecutive_failures > 0 THEN NULL
                                     ELSE portal.api_failure_state.resolved_at END`,
      [name, streak.consecutiveFailures, streak.firstFailureAt, now, streak.degraded, streak.recovered ? now : null, streak.recovered],
    );

    if (streak.justDegraded) {
      // Best-effort, like the scheduler's dead-letter alert: the log row is
      // already written, so a failed publish must not fail the pulse.
      await publishEvent({
        type: "integration.degraded",
        category: "integration",
        entityType: "integration",
        entityRef: name,
        actorId: actor.id,
        priority: "urgent",
        payload: { integration: name, failures: streak.consecutiveFailures, since: streak.firstFailureAt, error: errorText(outcome) },
        dedupeKey: `integration.degraded:${name}:${streak.firstFailureAt}`,
      }).catch(() => undefined);
    }

    checked.push({ integration: name, status, ms });
  }

  const purged = await query<{ id: string }>(
    `DELETE FROM portal.api_health_log WHERE checked_at < NOW() - make_interval(days => $1) RETURNING id`,
    [RETAIN_DAYS],
  );

  return { checked, skipped: 11 - checked.length, purged: purged.length };
}
