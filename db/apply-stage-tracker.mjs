/**
 * Put the Stage Tracker's table (064) on one database — and change nothing
 * else.
 *
 *   $env:DATABASE_URL="postgres://..."
 *   node db/apply-stage-tracker.mjs
 *
 * Same reason as apply-team-weekly-board.mjs for not using db/migrate.mjs:
 * 901_design_tracker_fixtures.sql deletes its projects by name and inserts
 * them again, which is wrong for a database with people's work in it.
 *
 * Every statement in 064 is IF NOT EXISTS, so running this twice is a no-op.
 * Run it before deploying /stage-board, which reads the table.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const HERE = dirname(fileURLToPath(import.meta.url));
const FILES = ["064_stage_tracker.sql"];

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("\n  DATABASE_URL is not set.\n\n  PowerShell:  $env:DATABASE_URL=\"postgres://...\"\n");
  process.exit(1);
}

// Never print the credential; the host is enough to confirm the target.
console.log(`\n  target : ${url.replace(/\/\/[^@]+@/, "//****@")}`);

const client = new pg.Client({
  connectionString: url,
  ssl: /localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: false },
});
await client.connect();

let ok = true;
try {
  for (const FILE of FILES) {
    process.stdout.write(`  ${FILE.padEnd(34)}`);
    await client.query("BEGIN");
    await client.query(readFileSync(join(HERE, FILE), "utf8"));
    await client.query("COMMIT");
    console.log("ok");
  }
  const { rows: [r] } = await client.query(`SELECT COUNT(*)::int AS n FROM ee.stage_tracker_rows`);
  console.log(`  rows on the tracker : ${r.n}\n`);
} catch (err) {
  await client.query("ROLLBACK").catch(() => {});
  console.log(`FAILED\n\n  ${err.message}\n`);
  ok = false;
}

await client.end();
process.exit(ok ? 0 : 1);
