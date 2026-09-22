/**
 * Clear the HIRING demo data, so HR opens a clean board instead of three
 * invented people.
 *
 *   node db/clear-hiring-demo.mjs
 *
 * db/900_dev_fixtures.sql seeds three candidates — Aarti Sethi, Rohit Menon,
 * Sana Qureshi — with roles, rounds, panels and scorecards behind them. They
 * exist so the board has something on it while it is being built. The moment
 * real HR signs in, they are three strangers in the way.
 *
 * WHAT THIS DELETES: every row in the hiring tables. All of it.
 *
 * WHAT IT DOES NOT TOUCH, and why each one matters:
 *
 *   · public.users — the fixture accounts. The WIO tracker, the decks, the
 *     workflow seeds and the PIO approval chain all point at them. Removing
 *     them breaks modules that have nothing to do with hiring.
 *
 *   · hr.interview_stages — that is the pipeline itself (applied → HR
 *     conversation → department → HOD → founder → offer), not demo data.
 *     Clearing it would leave nowhere to put a candidate.
 *
 *   · db/900_dev_fixtures.sql — deliberately left alone. It is what the
 *     schema harness loads, and db/validate.mjs asserts on exactly these
 *     rows ("RLS opens the whole board to HR, by department" expects 3
 *     candidates and 2 interviews). Editing the fixture would clear the
 *     board and break the proof in the same stroke. So the rows are removed
 *     from the running database, and the harness keeps its own copy.
 *
 * THIS IS A DEV TOOL AND IT SHOULD STAY ONE. Production never had these rows:
 * db/migrate.mjs skips 900_dev_fixtures.sql unless --with-fixtures is passed.
 * Pointing this at a database with real candidates in it would delete them,
 * and the module's first rule is that nothing deletes — so it refuses to run
 * against anything that does not look like the dev database.
 *
 * Run with `next dev` STOPPED — PGlite takes one connection (A-15).
 */
import pg from "pg";

const DEV_URL = "postgres://postgres:postgres@127.0.0.1:55432/postgres";
const url = process.env.DATABASE_URL ?? DEV_URL;

/* The guard. A candidate file is somebody's CV, their phone number and what
   they are asking to be paid; "nothing deletes" is rule one of this module.
   So this refuses anything that is not the local PGlite dev server, and the
   way past it is to mean it out loud. */
if (!/127\.0\.0\.1:55432|localhost:55432/.test(url)) {
  if (process.env.I_MEAN_IT !== "yes") {
    console.error("");
    console.error("  Refusing: that is not the dev database.");
    console.error(`  target: ${url.replace(/\/\/[^@]+@/, "//****@")}`);
    console.error("");
    console.error("  This deletes every candidate, round and scorecard it can");
    console.error("  reach. If that is genuinely what you want somewhere else,");
    console.error("  re-run with I_MEAN_IT=yes.");
    console.error("");
    process.exit(1);
  }
}

const client = new pg.Client({ connectionString: url });
await client.connect();

const count = async (t) => {
  const { rows } = await client.query(`SELECT count(*)::int AS n FROM ${t}`);
  return rows[0].n;
};

/* Dependency order, parent last. Most of these would go by ON DELETE CASCADE,
   but naming each one means a table added later shows up as a leftover in the
   "after" count rather than being quietly missed. */
const TABLES = [
  "hr.scorecard_answers",
  "hr.scorecards",
  "hr.interview_responses",
  "hr.candidate_documents",
  "hr.candidate_invites",
  "hr.interview_panel",
  "hr.voice_calls",
  "hr.interviews",
  "hr.candidate_activity",
  "hr.candidates",
  "hr.questions",
  "hr.question_sets",
  "hr.open_roles",
];

try {
  const { rows: names } = await client.query(
    "SELECT full_name FROM hr.candidates ORDER BY full_name",
  );
  console.log("");
  console.log("  removing:", names.map((r) => r.full_name).join(", ") || "(nothing)");
  console.log("");

  let before = 0;
  for (const t of TABLES) before += await count(t);

  await client.query("BEGIN");
  for (const t of TABLES) await client.query(`DELETE FROM ${t}`);
  await client.query("COMMIT");

  let after = 0;
  for (const t of TABLES) after += await count(t);

  console.log(`  ${before} rows gone, ${after} left.`);
  console.log("");
  console.log("  kept:");
  console.log(`    hr.interview_stages   ${await count("hr.interview_stages")}  the pipeline`);
  console.log(`    public.users          ${await count("public.users")}  other modules need them`);
  console.log("");
  console.log("  The board is empty. Open a seat on it and add a real candidate.");
  console.log("");
} catch (err) {
  await client.query("ROLLBACK").catch(() => {});
  console.error("FAILED:", err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
