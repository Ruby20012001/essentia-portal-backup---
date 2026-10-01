/**
 * Put Project Desk's one table on a database — and nothing else.
 *
 *   node --env-file=../frontend/.env.local apply-project-desk.mjs
 *   (or set DATABASE_URL yourself first)
 *
 * The same reasoning as apply-hr-portal.mjs: migrate.mjs runs the fixtures
 * too, and 901 rewrites the design team's projects. This runs 059 only, in
 * one transaction, and 059 is idempotent — running it twice is a no-op.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const HERE = dirname(fileURLToPath(import.meta.url));
const FILE = "059_project_desk.sql";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("\n  DATABASE_URL is not set.\n");
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
process.stdout.write(`  ${FILE.padEnd(34)}`);
try {
  await client.query("BEGIN");
  await client.query(readFileSync(join(HERE, FILE), "utf8"));
  await client.query("COMMIT");
  const { rows } = await client.query("SELECT count(*)::int AS n FROM desk.projects");
  console.log(`ok — desk.projects holds ${rows[0].n} project(s)\n`);
} catch (err) {
  await client.query("ROLLBACK").catch(() => {});
  console.log(`FAILED\n\n  ${err.message}\n`);
  ok = false;
}

await client.end();
process.exit(ok ? 0 : 1);
