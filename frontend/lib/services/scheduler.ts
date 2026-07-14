import { query } from "@/lib/db";
import { getConfig } from "@/lib/services/config";
import { requirePermission } from "@/lib/services/permissions";
import { writeAudit } from "@/lib/services/audit";
import { NotFoundError } from "@/lib/services/blocking";
import type { SessionUser } from "@/lib/auth/session";
import { processDueDeliveries, publishEvent } from "@/lib/notifications";
import { sweepWioClock } from "@/lib/services/wio";
import { runKekaSync } from "@/lib/integrations/keka/sync";
import { evaluateWorkflowTimers } from "@/lib/services/workflow-timers";
import { snapshotFounderBrief } from "@/lib/services/founder-brief";

/**
 * Auto-pilot scheduler (resolves A-14 / IG-06). Cadence lives as data in
 * portal.scheduled_jobs; a tick (POST /api/jobs/tick, driven by an external
 * cron) evaluates due jobs and runs them. Single-fire is enforced by
 * UNIQUE(job_id, scheduled_for) on portal.job_runs — two concurrent ticks
 * cannot both claim a slot. Failures retry with exponential backoff up to
 * max_attempts, then dead-letter.
 *
 * The scheduler holds NO business logic (PAS §6): HANDLERS references the same
 * service functions the /api/jobs/* routes call. It acts as the system service
 * account (L1) so cross-department sweeps see every record under RLS.
 */

const SYSTEM_USER_ID = "00000000-0000-4000-8000-0000000000a0";

/** The identity the auto-pilot acts as (seeded in db/011). */
export const AUTOPILOT: SessionUser = {
  id: SYSTEM_USER_ID,
  name: "Essentia Auto-Pilot",
  accessLevel: "L1",
  departmentId: null,
};

type JobHandler = (actor: SessionUser) => Promise<unknown>;

/** Registry: job name → handler. Wiring only — the logic lives in each module. */
const HANDLERS: Record<string, JobHandler> = {
  "notifications-dispatch": () => processDueDeliveries(),
  "wio-clock": (actor) => sweepWioClock(actor),
  "keka-sync": async (actor) => {
    if (!(await getConfig<boolean>("keka.sync_enabled", true))) {
      return { skipped: true, reason: "keka.sync_enabled is false" };
    }
    return runKekaSync(actor, "scheduled");
  },
  "workflow-timers": (actor) => evaluateWorkflowTimers(actor),
  "founder-morning-brief": (actor) => snapshotFounderBrief(actor),
};

type JobRow = {
  id: string;
  name: string;
  schedule_kind: "interval" | "daily";
  schedule_expr: string;
  enabled: boolean;
  max_attempts: number;
  backoff_base_seconds: number;
};

type JobOutcome = "succeeded" | "failed" | "dead" | "skipped" | "not_due";

export type TickResult = {
  enabled: boolean;
  ranAt: string;
  jobs: Array<{
    name: string;
    slot: string | null;
    outcome: JobOutcome;
    attempt?: number;
    detail?: string;
  }>;
};

/**
 * The most recent scheduled slot at or before `now`, or null if the job has
 * not yet reached a runnable slot. Pure and deterministic (unit-tested).
 *   interval → schedule_expr = seconds; slot = floor(now / seconds).
 *   daily    → schedule_expr = 'HH:MM'; slot = today HH:MM once now passes it.
 */
export function computeDueSlot(
  kind: "interval" | "daily",
  expr: string,
  now: Date,
): Date | null {
  if (kind === "interval") {
    const seconds = Number(expr);
    if (!Number.isFinite(seconds) || seconds < 1) return null;
    const ms = seconds * 1000;
    return new Date(Math.floor(now.getTime() / ms) * ms);
  }
  const [h, m] = expr.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  const slot = new Date(now);
  slot.setHours(h, m, 0, 0);
  return now.getTime() >= slot.getTime() ? slot : null;
}

function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** The auto-pilot tick — evaluate every enabled job and run what is due. */
export async function runDueJobs(
  trigger: "scheduler" | "manual" = "scheduler",
): Promise<TickResult> {
  const now = new Date();
  if (!(await getConfig<boolean>("scheduler.enabled", true))) {
    return { enabled: false, ranAt: now.toISOString(), jobs: [] };
  }
  const jobs = await query<JobRow>(
    `SELECT id, name, schedule_kind, schedule_expr, enabled, max_attempts, backoff_base_seconds
     FROM portal.scheduled_jobs
     WHERE enabled = TRUE
     ORDER BY name`,
  );

  const results: TickResult["jobs"] = [];
  for (const job of jobs) {
    // A failed job MUST NOT wedge the sweep — isolate each.
    try {
      results.push(await runOneJob(job, now, trigger));
    } catch (error) {
      results.push({ name: job.name, slot: null, outcome: "failed", detail: errMessage(error) });
    }
  }
  return { enabled: true, ranAt: now.toISOString(), jobs: results };
}

async function runOneJob(
  job: JobRow,
  now: Date,
  trigger: "scheduler" | "manual",
): Promise<TickResult["jobs"][number]> {
  // Prefer resuming a retriable failed slot; otherwise the current due slot.
  const [retriable] = await query<{ scheduled_for: string }>(
    `SELECT scheduled_for FROM portal.job_runs
     WHERE job_id = $1 AND status = 'failed' AND attempt < $2
       AND (next_attempt_at IS NULL OR next_attempt_at <= $3)
     ORDER BY scheduled_for ASC
     LIMIT 1`,
    [job.id, job.max_attempts, now.toISOString()],
  );

  const slot = retriable
    ? new Date(retriable.scheduled_for)
    : computeDueSlot(job.schedule_kind, job.schedule_expr, now);
  if (!slot) return { name: job.name, slot: null, outcome: "not_due" };

  // Claim the slot. A fresh slot inserts; a 'failed' slot re-claims (retry).
  // Any other state (running/succeeded/dead) fails the WHERE → not claimed.
  const claimed = await query<{ id: string; attempt: number }>(
    `INSERT INTO portal.job_runs
       (job_id, job_name, scheduled_for, trigger, status, attempt, started_at)
     VALUES ($1, $2, $3, $4, 'running', 1, NOW())
     ON CONFLICT (job_id, scheduled_for) DO UPDATE
       SET status = 'running',
           attempt = portal.job_runs.attempt + 1,
           started_at = NOW(),
           next_attempt_at = NULL,
           error = NULL
       WHERE portal.job_runs.status = 'failed'
         AND portal.job_runs.attempt < $5
     RETURNING id, attempt`,
    [job.id, job.name, slot.toISOString(), trigger, job.max_attempts],
  );
  if (!claimed.length) {
    return { name: job.name, slot: slot.toISOString(), outcome: "skipped", detail: "already claimed" };
  }

  return executeRun(job, claimed[0]!.id, claimed[0]!.attempt, slot, now);
}

/** Runs the handler for a claimed run row and records the outcome. */
async function executeRun(
  job: JobRow,
  runId: string,
  attempt: number,
  slot: Date,
  now: Date,
): Promise<TickResult["jobs"][number]> {
  const handler = HANDLERS[job.name];
  if (!handler) {
    const dead = await markFailed(job, runId, attempt, now, `no handler registered for '${job.name}'`);
    return { name: job.name, slot: slot.toISOString(), outcome: dead ? "dead" : "failed", attempt, detail: "no handler" };
  }

  const started = Date.now();
  try {
    const result = await handler(AUTOPILOT);
    const durationMs = Date.now() - started;
    await query(
      `UPDATE portal.job_runs
         SET status = 'succeeded', finished_at = NOW(), duration_ms = $2, result = $3::jsonb
       WHERE id = $1`,
      [runId, durationMs, JSON.stringify(result ?? {})],
    );
    await query(
      `UPDATE portal.scheduled_jobs
         SET last_run_at = NOW(), last_status = 'succeeded', updated_at = NOW()
       WHERE id = $1`,
      [job.id],
    );
    await writeAudit({
      userId: AUTOPILOT.id, role: AUTOPILOT.accessLevel,
      action: "JOB_RUN", resourceType: "scheduler", resourceId: job.id,
      newValues: { job: job.name, status: "succeeded", attempt, durationMs },
    });
    return { name: job.name, slot: slot.toISOString(), outcome: "succeeded", attempt };
  } catch (error) {
    const durationMs = Date.now() - started;
    const dead = await markFailed(job, runId, attempt, now, errMessage(error), durationMs);
    return { name: job.name, slot: slot.toISOString(), outcome: dead ? "dead" : "failed", attempt, detail: errMessage(error) };
  }
}

/** Records a failed run: dead-letters at max_attempts, else sets a backoff gate. */
async function markFailed(
  job: JobRow,
  runId: string,
  attempt: number,
  now: Date,
  message: string,
  durationMs?: number,
): Promise<boolean> {
  const dead = attempt >= job.max_attempts;
  const backoffMs = job.backoff_base_seconds * 1000 * Math.pow(2, attempt - 1);
  const nextAttempt = new Date(now.getTime() + backoffMs).toISOString();
  await query(
    `UPDATE portal.job_runs
       SET status = $2, finished_at = NOW(), duration_ms = $3, error = $4,
           next_attempt_at = CASE WHEN $2 = 'failed' THEN $5::timestamptz ELSE NULL END
     WHERE id = $1`,
    [runId, dead ? "dead" : "failed", durationMs ?? null, message, nextAttempt],
  );
  await query(
    `UPDATE portal.scheduled_jobs SET last_status = $2, updated_at = NOW() WHERE id = $1`,
    [job.id, dead ? "dead" : "failed"],
  );
  await writeAudit({
    userId: AUTOPILOT.id, role: AUTOPILOT.accessLevel,
    action: "JOB_RUN", resourceType: "scheduler", resourceId: job.id,
    newValues: { job: job.name, status: dead ? "dead" : "failed", attempt, error: message },
  });
  if (dead) {
    // Alert the platform operators (config-driven recipients via the
    // 'platform_admins' route). Best-effort — the dead-letter is already
    // recorded and audited; a publish failure must not mask the job failure.
    await publishEvent({
      type: "scheduler.job_dead",
      category: "system",
      entityType: "scheduled_job",
      entityId: job.id,
      entityRef: job.name,
      actorId: AUTOPILOT.id,
      priority: "urgent",
      payload: { job: job.name, attempts: attempt, error: message },
      dedupeKey: `scheduler.job_dead:${runId}`,
    }).catch(() => undefined);
  }
  return dead;
}

/** Scheduler status for the admin surface. Read-gated. */
export async function listJobs(user: SessionUser): Promise<{
  jobs: Array<Record<string, unknown>>;
  recentRuns: Array<Record<string, unknown>>;
}> {
  await requirePermission(user, "read", "scheduler");
  const jobs = await query<Record<string, unknown>>(
    `SELECT id, name, description, schedule_kind, schedule_expr, enabled,
            max_attempts, backoff_base_seconds, last_run_at, last_status
     FROM portal.scheduled_jobs ORDER BY name`,
  );
  const recentRuns = await query<Record<string, unknown>>(
    `SELECT job_name, scheduled_for, trigger, status, attempt,
            started_at, finished_at, duration_ms, error
     FROM portal.job_runs ORDER BY started_at DESC LIMIT 50`,
  );
  return { jobs, recentRuns };
}

/** Manually run a single job now (admin action, trigger='manual'). */
export async function runJobManually(
  user: SessionUser,
  name: string,
): Promise<TickResult["jobs"][number]> {
  await requirePermission(user, "escalate", "scheduler");
  const [job] = await query<JobRow>(
    `SELECT id, name, schedule_kind, schedule_expr, enabled, max_attempts, backoff_base_seconds
     FROM portal.scheduled_jobs WHERE name = $1`,
    [name],
  );
  if (!job) throw new NotFoundError(`No scheduled job named '${name}'.`);

  const now = new Date();
  const [run] = await query<{ id: string; attempt: number }>(
    `INSERT INTO portal.job_runs
       (job_id, job_name, scheduled_for, trigger, status, attempt, started_at)
     VALUES ($1, $2, $3, 'manual', 'running', 1, NOW())
     RETURNING id, attempt`,
    [job.id, job.name, now.toISOString()],
  );
  return executeRun(job, run!.id, run!.attempt, now, now);
}
