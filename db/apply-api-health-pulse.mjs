/**
 * Switch the five-minute API health pulse on for one database — and change
 * nothing else.
 *
 *   set DATABASE_URL=postgres://...   (PowerShell: $env:DATABASE_URL="...")
 *   node db/apply-api-health-pulse.mjs
 *
 * WHY THIS EXISTS INSTEAD OF db/migrate.mjs. Same reason as
 * apply-hr-portal.mjs: migrate.mjs runs every file in DEFAULT_FILES, and
 * 901_design_tracker_fixtures.sql deletes its projects by name and inserts
 * them again. That is right for a fresh database and wrong for one with
 * people's work in it.
 *
 * So this applies exactly 061_api_health_pulse.sql: the 'api-health-pulse'
 * scheduled job and the 'integration.degraded' alert route. Both inserts are
 * ON CONFLICT DO NOTHING, so running it twice is a no-op.
 *
 * WHAT IT DOES NOT DO. It does not make anything get checked by itself:
 *   - the scheduler has to be ticking (POST /api/jobs/tick from a cron), and
 *   - only Anthropic has a probe, and only where ANTHROPIC_API_KEY is set on
 *     the deployment that runs the tick.
 * The summary at the end says which of those it can see from the database.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const HERE = dirname(fileURLToPath(import.meta.url));
const FILE = "061_api_health_pulse.sql";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("");
  console.error("  DATABASE_URL is not set.");
  console.error("");
  console.error("  PowerShell:  $env:DATABASE_URL=\"postgres://...\"");
  console.error("  cmd:         set DATABASE_URL=postgres://...");
  console.error("");
  process.exit(1);
}

// Never print the credential; the host is enough to confirm the target.
const target = url.replace(/\/\/[^@]+@/, "//****@");
console.log("");
console.log(`  target : ${target}`);
console.log(`  file   : ${FILE}`);
console.log("");

const client = new pg.Client({
  connectionString: url,
  ssl: /localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: false },
});
await client.connect();

let ok = false;
process.stdout.write(`  ${FILE.padEnd(34)}`);
try {
  await client.query("BEGIN");
  await client.query(readFileSync(join(HERE, FILE), "utf8"));
  await client.query("COMMIT");
  console.log("ok");
  ok = true;
} catch (err) {
  await client.query("ROLLBACK").catch(() => {});
  console.log("FAILED");
  console.log(`\n  ${err.message}\n`);
}

if (ok) {
  const { rows: [job] } = await client.query(
    `SELECT enabled, last_run_at::text AS last_run, last_status
       FROM portal.scheduled_jobs WHERE name = 'api-health-pulse'`,
  );
  const { rows: [tick] } = await client.query(
    `SELECT MAX(started_at)::text AS at FROM portal.job_runs`,
  );
  const { rows: [checks] } = await client.query(
    `SELECT COUNT(*)::int AS n FROM portal.api_health_log`,
  );
  console.log("");
  console.log(`  job enabled      : ${job?.enabled ? "yes" : "NO"}`);
  console.log(`  pulse last ran   : ${job?.last_run ?? "never"}${job?.last_status ? ` (${job.last_status})` : ""}`);
  console.log(`  any job ever ran : ${tick?.at ?? "no — the scheduler is not ticking on this database"}`);
  console.log(`  health checks    : ${checks.n} logged`);
  console.log("");
  if (!tick?.at) {
    console.log("  Nothing will be checked until something calls POST /api/jobs/tick.");
    console.log("");
  }
}

await client.end();
process.exit(ok ? 0 : 1);
