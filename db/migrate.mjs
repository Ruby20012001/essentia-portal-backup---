/**
 * Load the schema and seeds into a real PostgreSQL database.
 *
 *   node db/migrate.mjs
 *
 * Reads DATABASE_URL from frontend/.env.local (the same value the app uses),
 * then runs every file in DEFAULT_FILES in order, each inside a transaction so
 * a failure leaves nothing half-applied.
 *
 * This is the production counterpart to validate.mjs and dev-db.mjs, which both
 * run against in-memory PGlite. Those prove the schema loads; this one puts it
 * somewhere the data survives a restart.
 *
 * Re-runnable: every migration is written to be idempotent, so running this
 * again against a loaded database is a no-op rather than a duplicate.
 *
 * THE 900-SERIES IS SKIPPED unless --with-fixtures is passed. Those files seed
 * invented rows and accounts sharing one published password; they have no
 * business in a database real people will use.
 *
 * It is a NUMBER RANGE and not a list of filenames, and that is the fix for a
 * real bug rather than tidiness. This used to name `900_dev_fixtures.sql` and
 * only that, while `901_design_tracker_fixtures.sql` sat in DEFAULT_FILES and
 * ran. 901's own header says it is "loaded by db/dev-db.mjs and never by a
 * real deployment" and that "the real accounts are untouched" — both untrue
 * through this script, which is exactly how a file can look safe while not
 * being it.
 *
 * What that would have done to a production database: inserted four invented
 * concept decks and a board of invented projects, and — the serious half —
 * overwritten five real designers' passwords with a shared hash whose
 * plaintext is written in the open in that file, on GitHub.
 *
 * So: anything matching 9NN_ is a fixture, and a 902 written next year is
 * covered without anybody having to remember this.
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { DEFAULT_FILES, harnessSubstitutions } from "./lib.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const WITH_FIXTURES = process.argv.includes("--with-fixtures");

function readEnv() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const envPath = join(HERE, "..", "frontend", ".env.local");
  if (!existsSync(envPath)) {
    throw new Error("DATABASE_URL not set and frontend/.env.local not found.");
  }
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^DATABASE_URL=(.*)$/);
    if (m) return m[1].trim();
  }
  throw new Error("DATABASE_URL not found in frontend/.env.local.");
}

const url = readEnv();
// Never print the credential; the host is enough to confirm the target.
const target = url.replace(/\/\/[^@]+@/, "//****@");

/** Anything numbered 9NN is a dev fixture, by convention and now by rule. */
const isFixture = (f) => /^9\d\d_/.test(f);

const skipped = DEFAULT_FILES.filter(isFixture);
const files = DEFAULT_FILES.filter((f) => {
  if (isFixture(f) && !WITH_FIXTURES) return false;
  return existsSync(join(HERE, f));
});

console.log(`\n  target : ${target}`);
console.log(`  files  : ${files.length}`);
/* Naming them, rather than the word "fixtures". The old message said "(dev
   fixtures skipped)" while one of the two was running — a line that told you
   the opposite of what was happening is worse than no line. */
if (WITH_FIXTURES) {
  console.log(`  ALSO LOADING FIXTURES: ${skipped.join(", ")}`);
  console.log("  These carry invented rows and shared published passwords.");
} else {
  console.log(`  skipped: ${skipped.join(", ")}`);
}
console.log("");

const client = new pg.Client({ connectionString: url });
await client.connect();

let failed = null;
for (const f of files) {
  // The PGlite-only substitution must NOT apply here: real Postgres has
  // pgcrypto, and stubbing it out would silently diverge from what the
  // harness proved.
  const sql = readFileSync(join(HERE, f), "utf8");
  process.stdout.write(`  ${f.padEnd(42)}`);
  try {
    await client.query("BEGIN");
    await client.query(sql);
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
      WHERE table_schema NOT IN ('pg_catalog','information_schema')`,
  );
  console.log(`\n  done — ${rows[0].n} tables\n`);
}

await client.end();
process.exit(failed ? 1 : 0);

export { harnessSubstitutions };
