/**
 * Local development database — PGlite served over the PostgreSQL wire
 * protocol, so the Next.js app's ordinary `pg` Pool connects to it exactly
 * as it will to AWS RDS. Zero Postgres install required.
 *
 *   npm run dev-db      → postgres://postgres:postgres@127.0.0.1:55432/postgres
 *
 * Single-connection: set PGPOOL_MAX=1 in frontend/.env.local (see
 * .env.example). Data lives in memory — restart = fresh schema + fixtures.
 * DEV ONLY. Production runs real PostgreSQL 15+ with pgvector.
 */
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { createDb, here, loadSqlFiles, resolveFiles } from "./lib.mjs";

const PORT = Number(process.env.DEV_DB_PORT ?? 55432);

/**
 * The database is kept on disk, under db/.dev-data, so that restarting the
 * server does not throw away what is in it.
 *
 * It used to live in memory, and everything entered through the app went with
 * it on every restart: the projects on the board, the decks, and — the one
 * that actually hurt — the pictures uploaded into a deck, which are rows in
 * ee.concept_deck_images rather than anything in a file. Monica lost those
 * three times in an afternoon.
 *
 * The SQL runs once, when the directory is created. After that the schema and
 * the fixtures are already in there, and re-running them would undo work:
 * db/901 deletes and re-inserts its six projects by name, so a designer's
 * ticks would be wiped by the act of starting the server.
 *
 * DEV_DB_FRESH=true starts over — delete the directory and load everything
 * again. That is how a fixture change is picked up, and how to get back to a
 * known board.
 */
const DATA_DIR = join(here, ".dev-data");
if (process.env.DEV_DB_FRESH === "true" && existsSync(DATA_DIR)) {
  rmSync(DATA_DIR, { recursive: true, force: true });
  console.log("dev-db: starting fresh — previous data removed");
}
const firstRun = !existsSync(DATA_DIR);

const db = createDb(DATA_DIR);
if (firstRun) {
  const failed = await loadSqlFiles(db, resolveFiles());
  if (failed) {
    console.error("dev-db: aborting — SQL failed to load");
    process.exit(1);
  }
} else {
  console.log("dev-db: opening the existing database — set DEV_DB_FRESH=true to rebuild it");
}

const server = new PGLiteSocketServer({ db, port: PORT, host: "127.0.0.1" });
await server.start();
console.log(
  `dev-db: listening — DATABASE_URL=postgres://postgres:postgres@127.0.0.1:${PORT}/postgres`,
);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, async () => {
    await server.stop();
    await db.close();
    process.exit(0);
  });
}
