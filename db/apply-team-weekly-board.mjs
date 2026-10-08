/**
 * Put the Team Weekly Board's tables (062) and its 3D page's (063) on one
 * database — and change nothing else.
 *
 *   set DATABASE_URL=postgres://...   (PowerShell: $env:DATABASE_URL="...")
 *   node db/apply-team-weekly-board.mjs
 *
 * WHY THIS EXISTS INSTEAD OF db/migrate.mjs. Same reason as
 * apply-hr-portal.mjs: migrate.mjs runs every file in DEFAULT_FILES, and
 * 901_design_tracker_fixtures.sql deletes its projects by name and inserts
 * them again. That is right for a fresh database and wrong for one with
 * people's work in it.
 *
 * So this applies exactly 062_team_weekly_board.sql and 063_team_3d_board.sql,
 * each in its own transaction. Every statement is IF NOT EXISTS / ON CONFLICT
 * DO NOTHING, so running it twice is a no-op.
 *
 * ORDER MATTERS AGAINST THE DEPLOY. /team-board and /team-board/3d read these tables. Deploy
 * the code before this has run and the page throws until it does. Run this
 * first.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const HERE = dirname(fileURLToPath(import.meta.url));
const FILES = ["062_team_weekly_board.sql", "063_team_3d_board.sql"];

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
  ssl: /localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: false },
});
await client.connect();

// 063 is not tried when 062 fails: the 3D page sits behind the weekly board.
let ok = true;
for (const file of FILES) {
  process.stdout.write(`  ${file.padEnd(34)}`);
  try {
    await client.query("BEGIN");
    await client.query(readFileSync(join(HERE, file), "utf8"));
    await client.query("COMMIT");
    console.log("ok");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.log("FAILED");
    console.log(`\n  ${err.message}\n`);
    ok = false;
    break;
  }
}

if (ok) {
  const { rows } = await client.query(
    `SELECT kind, COUNT(*)::int AS n FROM ee.team_weekly_options GROUP BY kind ORDER BY kind`,
  );
  const { rows: [entries] } = await client.query(
    `SELECT COUNT(*)::int AS n FROM ee.team_weekly_entries`,
  );
  console.log("");
  for (const r of rows) console.log(`  ${r.kind.padEnd(16)} : ${r.n}`);
  console.log(`  ${"entries".padEnd(16)} : ${entries.n}`);
  const { rows: [teams3d] } = await client.query(
    `SELECT string_agg(name, ', ' ORDER BY sort_order) AS names FROM ee.team_3d_teams`,
  );
  const { rows: [projects3d] } = await client.query(
    `SELECT COUNT(*)::int AS n FROM ee.team_3d_projects`,
  );
  console.log(`  ${"3D teams".padEnd(16)} : ${teams3d.names ?? "none"}`);
  console.log(`  ${"3D projects".padEnd(16)} : ${projects3d.n}`);
  console.log("");
}

await client.end();
process.exit(ok ? 0 : 1);
