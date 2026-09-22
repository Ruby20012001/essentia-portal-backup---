/**
 * Put the HR interview portal's tables on a database — and nothing else.
 *
 *   set DATABASE_URL=postgres://...   (PowerShell: $env:DATABASE_URL="...")
 *   node db/apply-hr-portal.mjs
 *
 * WHY THIS EXISTS INSTEAD OF db/migrate.mjs.
 *
 * migrate.mjs runs every file in DEFAULT_FILES. Two of those are fixtures, and
 * one of them — 901_design_tracker_fixtures.sql — deletes its six projects by
 * name and inserts them again. Run against a database the design team is
 * actually using, that erases their ticks. It is the right tool for standing a
 * database up from nothing and the wrong one for adding three files to a live
 * database with people's work in it.
 *
 * So this applies exactly:
 *
 *   056_hr_candidate_portal.sql   the candidate's page — invites, replies,
 *                                 documents, and the third RLS fence
 *   057_hr_voice_agent.sql        the voice agent's call sessions
 *   058_hr_team_accounts.sql      the HR team's accounts and password hashes
 *
 * Each runs in its own transaction, so a failure leaves nothing half-applied.
 * All three are idempotent: running this twice is a no-op, not a duplicate.
 *
 * ORDER MATTERS AGAINST THE DEPLOY. `/hr` reads hr.interview_responses, which
 * 056 creates. Deploy the code before this has run and the hiring board throws
 * until it does. Run this first.
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const HERE = dirname(fileURLToPath(import.meta.url));

const FILES = [
  "056_hr_candidate_portal.sql",
  "057_hr_voice_agent.sql",
  "058_hr_team_accounts.sql",
];

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
console.log(`  files  : ${FILES.length}`);
console.log("");

const client = new pg.Client({
  connectionString: url,
  // Managed Postgres (Neon, Supabase, RDS) wants TLS; a local dev server does
  // not have a certificate to check. Both are handled without the caller
  // having to say which one they are pointing at.
  ssl: /localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: false },
});
await client.connect();

let failed = null;
for (const f of FILES) {
  const path = join(HERE, f);
  if (!existsSync(path)) {
    // 058 only exists once somebody has run set-hr-passwords.mjs. Missing is
    // a fact to report, not a failure to stop on: the other two still belong
    // on the database.
    console.log(`  ${f.padEnd(34)} not written yet — skipped`);
    continue;
  }
  process.stdout.write(`  ${f.padEnd(34)}`);
  try {
    await client.query("BEGIN");
    await client.query(readFileSync(path, "utf8"));
    await client.query("COMMIT");
    console.log("ok");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.log("FAILED");
    console.log(`\n  ${err.message}\n`);
    failed = f;
    break;
  }
}

if (!failed) {
  const { rows } = await client.query(
    `SELECT count(*)::int AS n FROM information_schema.tables
      WHERE table_schema = 'hr'`,
  );
  const { rows: staff } = await client.query(
    `SELECT u.display_name, d.code AS dept
       FROM public.users u
       LEFT JOIN public.departments d ON d.id = u.department_id
      WHERE u.email LIKE 'hr.%@essentia.in'
      ORDER BY u.display_name`,
  );
  console.log("");
  console.log(`  done — hr schema has ${rows[0].n} tables`);
  if (staff.length > 0) {
    console.log(`  HR accounts: ${staff.map((s) => `${s.display_name} (${s.dept})`).join(", ")}`);
    console.log("");
    console.log("  Anybody showing dept other than HR will sign in and see");
    console.log("  \"Restricted\" — the hiring grant is by department.");
  }
  console.log("");
}

await client.end();
process.exit(failed ? 1 : 0);
