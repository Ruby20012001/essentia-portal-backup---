/**
 * Shared PGlite loader used by validate.mjs (schema proof) and dev-db.mjs
 * (local wire-protocol dev database).
 */
import { readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { uuid_ossp } from "@electric-sql/pglite/contrib/uuid_ossp";
import { vector } from "@electric-sql/pglite-pgvector";

export const here = dirname(fileURLToPath(import.meta.url));

export const DEFAULT_FILES = [
  "001_essentia_schema.sql",
  "002_seed_departments.sql",
  "004_foundation.sql",
  "005_module_wio_pio.sql",
  "006_s4_hardening.sql",
  "007_app_role.sql",
  "008_auth_identity.sql",
  "009_keka_integration.sql",
  "010_notification_framework.sql",
  "011_scheduler_framework.sql",
  "012_scheduler_alerts.sql",
  "900_dev_fixtures.sql",
];

export function resolveFiles(requested = []) {
  return (requested.length ? requested : DEFAULT_FILES).filter((f) => {
    if (existsSync(join(here, f))) return true;
    if (requested.length) throw new Error(`No such file: ${f}`);
    console.log(`SKIP    ${f} (not written yet)`);
    return false;
  });
}

export function createDb() {
  return new PGlite({ extensions: { uuid_ossp, vector } });
}

// pgcrypto is core contrib on real PostgreSQL but is not compiled into
// PGlite's WASM build. The schema declares it and never calls its functions
// (all UUIDs come from uuid-ossp), so the harness stubs that one line.
export function harnessSubstitutions(sql) {
  return sql.replace(
    /^CREATE EXTENSION IF NOT EXISTS "pgcrypto";$/m,
    "-- [harness] pgcrypto skipped under PGlite (unused by schema; present on real PG)",
  );
}

/** Loads each file; returns the name of the first file that failed, or null. */
export async function loadSqlFiles(db, files) {
  for (const f of files) {
    const sql = harnessSubstitutions(await readFile(join(here, f), "utf8"));
    try {
      await db.exec(sql);
      console.log(`LOADED  ${f}`);
    } catch (err) {
      console.error(`FAILED  ${f}\n        ${err.message}`);
      return f;
    }
  }
  return null;
}
