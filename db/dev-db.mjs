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
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { createDb, loadSqlFiles, resolveFiles } from "./lib.mjs";

const PORT = Number(process.env.DEV_DB_PORT ?? 55432);

const db = createDb();
const failed = await loadSqlFiles(db, resolveFiles());
if (failed) {
  console.error("dev-db: aborting — SQL failed to load");
  process.exit(1);
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
