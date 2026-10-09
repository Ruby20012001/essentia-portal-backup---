/**
 * Put the Stage Tracker and the Team Weekly Board on the LIVE site's database,
 * and fill the Stage Tracker from the MASTER TRACKER — in one command.
 *
 *   1. In frontend/.env.local add one line, with the live database's address
 *      from Vercel (Project → Settings → Environment Variables → DATABASE_URL):
 *
 *        STAGE_SYNC_DATABASE_URL=postgres://...
 *
 *   2. node db/set-up-live-stage-tracker.mjs
 *
 * Why: the live site does not read the database frontend/.env.local's
 * DATABASE_URL points at (Monica, 8 Oct: /stage-board on Vercel answered
 * 'relation "ee.stage_tracker_rows" does not exist'). From then on the
 * watcher (db/watch-stage-tracker.mjs) syncs to STAGE_SYNC_DATABASE_URL too.
 *
 * Applies 062, 063 and 064 only, each in its own transaction, all IF NOT
 * EXISTS / ON CONFLICT DO NOTHING — never db/migrate.mjs, whose 901 fixtures
 * delete and re-insert projects by name. Prints the host, never the
 * credential.
 */
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const HERE = dirname(fileURLToPath(import.meta.url));
const FILES = ["062_team_weekly_board.sql", "063_team_3d_board.sql", "064_stage_tracker.sql"];

const envFile = join(HERE, "..", "frontend", ".env.local");
const line = readFileSync(envFile, "utf8").split(/\r?\n/).find((l) => l.startsWith("STAGE_SYNC_DATABASE_URL="));
const url = line?.slice("STAGE_SYNC_DATABASE_URL=".length).trim();
if (!url) {
  console.error("\n  frontend/.env.local has no STAGE_SYNC_DATABASE_URL line yet.");
  console.error("  Copy DATABASE_URL from Vercel → Settings → Environment Variables (Production)");
  console.error("  and add it as:  STAGE_SYNC_DATABASE_URL=postgres://...\n");
  process.exit(1);
}

const host = (() => { try { return new URL(url).host; } catch { return "?"; } })();
console.log(`\n  live database : ${host}`);

const client = new pg.Client({
  connectionString: url,
  ssl: /localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: false },
});
await client.connect();
for (const file of FILES) {
  process.stdout.write(`  ${file.padEnd(30)}`);
  try {
    await client.query("BEGIN");
    await client.query(readFileSync(join(HERE, file), "utf8"));
    await client.query("COMMIT");
    console.log("ok");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.log(`FAILED\n\n  ${err.message}\n`);
    await client.end();
    process.exit(1);
  }
}
await client.end();

console.log("\n  filling the Stage Tracker from the MASTER TRACKER…");
const sync = spawnSync(process.execPath,
  [join(HERE, "sync-stage-tracker.mjs"), "--apply", "--env-local"],
  { stdio: "inherit", env: { ...process.env, DATABASE_URL: "", NODE_NO_WARNINGS: "1" } });
process.exit(sync.status ?? 1);
