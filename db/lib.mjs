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
  "013_workflow_engine_v1.sql",
  "014_workflow_pio_groups.sql",
  "015_workflow_actions_task.sql",
  "016_workflow_context.sql",
  "017_workflow_delegation.sql",
  "018_workflow_sla.sql",
  "019_workflow_notify.sql",
  "020_workflow_advisory.sql",
  "021_founder_brief_snapshot.sql",
  "022_weekly_pulse_job.sql",
  "023_exit_protocol.sql",
  "024_succession_pack.sql",
  "025_delegation_expiry.sql",
  "026_sla_fire_once.sql",
  "027_workflow_definition_admin.sql",
  "028_wio_approval.sql",
  "029_eh_experience_centre.sql",
  "030_wio_pio_tracker.sql",
  "031_wio_pio_tracker_seed.sql",
  "032_wio_pio_tracker_teams.sql",
  "033_wio_pio_tracker_team_tagging.sql",
  "034_wio_pio_tracker_standup_2026_08_31.sql",
  "035_wio_team_accounts.sql",
  "036_remove_ai_advisory.sql",
  "037_wio_team_passwords.sql",
  "038_tracker_write_only_drafting.sql",
  "039_tracker_view_account.sql",
  "040_lead_password_reset.sql",
  "041_signin_codes.sql",
  "042_concept_decks.sql",
  "043_design_team_accounts.sql",
  "044_concept_decks_grants.sql",
  "045_tracker_countdown_rev_a.sql",
  "046_tracker_finishes_fg_code_d13.sql",
  "047_tracker_alarm2_selection.sql",
  "048_tracker_client_d6_vishakha_scope_timeline.sql",
  "049_hr_interviews.sql",
  "050_design_activity_tracker.sql",
  "051_design_project_types.sql",
  "052_design_reminders.sql",
  "053_design_tracker_links.sql",
  "900_dev_fixtures.sql",
  "901_design_tracker_fixtures.sql",
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
