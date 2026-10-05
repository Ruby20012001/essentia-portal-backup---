/**
 * Import projects and vendors from CSV files — adds rows, never changes or
 * removes one.
 *
 *   $env:DATABASE_URL="postgres://..."           (PowerShell)
 *   node db/import-projects-vendors.mjs --projects projects.csv --vendors vendors.csv
 *   node db/import-projects-vendors.mjs --projects projects.csv --apply
 *
 * Templates: db/templates/projects.csv and db/templates/vendors.csv. Open
 * them in Excel, fill one row per project or vendor, Save As "CSV UTF-8".
 *
 * WITHOUT --apply NOTHING IS SAVED. The run is a preview: every row is
 * checked, then the whole import runs inside a transaction that is rolled
 * back, so the summary is exactly what --apply would do. With --apply the
 * same transaction is committed. Either way it is all-or-nothing: one bad
 * row, and nothing from that run is written.
 *
 * What it will not do:
 *   - overwrite. A project_code or vrn_number already in the database is
 *     skipped and listed, never updated;
 *   - read PAN, Aadhaar or bank columns. A file that has them is refused —
 *     those do not travel in a spreadsheet;
 *   - guess. A date must be YYYY-MM-DD, a fee plain digits, a CRM TL email
 *     must belong to someone already in the portal.
 *
 * Families: a project names its family. One already in the portal with the
 * same name in the same city is reused; otherwise it is created. The
 * summary says which, so two different families of one name are caught
 * before --apply, not after.
 *
 * WHICH DATABASE. This writes to whatever DATABASE_URL points at. Neon is a
 * test database (CLAUDE.md) — no backup, and its connection string has been
 * in a chat transcript. Put real client data only where it has been decided
 * real data lives.
 */
import { readFileSync } from "node:fs";
import pg from "pg";
import { checkProjects, checkVendors, parseCsv, toRecords } from "./import-rows.mjs";

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : null;
};
const projectsFile = opt("projects");
const vendorsFile = opt("vendors");
const apply = args.includes("--apply");

if (!projectsFile && !vendorsFile) {
  console.error("\n  Give at least one file:  --projects <file.csv>  and/or  --vendors <file.csv>\n");
  process.exit(1);
}
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("\n  DATABASE_URL is not set.\n");
  process.exit(1);
}

function load(file, check) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch (e) {
    return { problems: [`cannot read ${file}: ${e.message}`], rows: [] };
  }
  return check(toRecords(parseCsv(text)));
}

const projects = projectsFile ? load(projectsFile, checkProjects) : { problems: [], rows: [] };
const vendors = vendorsFile ? load(vendorsFile, checkVendors) : { problems: [], rows: [] };

console.log("");
console.log(`  target  : ${url.replace(/\/\/[^@]+@/, "//****@")}`);
console.log(`  mode    : ${apply ? "APPLY — rows will be saved" : "preview — nothing will be saved"}`);
if (projectsFile) console.log(`  projects: ${projectsFile} (${projects.rows.length} rows)`);
if (vendorsFile) console.log(`  vendors : ${vendorsFile} (${vendors.rows.length} rows)`);
console.log("");

const fileProblems = [
  ...projects.problems.map((p) => `projects ${p}`),
  ...vendors.problems.map((p) => `vendors ${p}`),
];
if (fileProblems.length) {
  console.log("  Nothing was imported. Fix these and run it again:\n");
  for (const p of fileProblems) console.log(`    - ${p}`);
  console.log("");
  process.exit(1);
}

const client = new pg.Client({
  connectionString: url,
  ssl: /localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: false },
});
await client.connect();

const report = { projectsAdded: [], projectsSkipped: [], familiesNew: [], familiesReused: [], vendorsAdded: [], vendorsSkipped: [] };
const dbProblems = [];

try {
  await client.query("BEGIN");

  for (const p of projects.rows) {
    const { rows: exists } = await client.query(`SELECT 1 FROM ee.projects WHERE lower(project_code) = lower($1)`, [p.projectCode]);
    if (exists.length) {
      report.projectsSkipped.push(p.projectCode);
      continue;
    }

    let tlId = null;
    if (p.crmTlEmail) {
      const { rows: tl } = await client.query(`SELECT id FROM public.users WHERE lower(email) = $1`, [p.crmTlEmail]);
      if (!tl.length) {
        dbProblems.push(`projects line ${p.line}: no portal user has the email in crm_tl_email`);
        continue;
      }
      tlId = tl[0].id;
    }

    const { rows: fam } = await client.query(
      `SELECT id FROM public.families
        WHERE lower(primary_contact) = lower($1) AND lower(COALESCE(city, '')) = lower(COALESCE($2, ''))
        ORDER BY created_at LIMIT 1`,
      [p.familyName, p.city],
    );
    let familyId;
    if (fam.length) {
      familyId = fam[0].id;
      report.familiesReused.push(`${p.projectCode} → existing family`);
    } else {
      const { rows: created } = await client.query(
        `INSERT INTO public.families (primary_contact, city) VALUES ($1, $2) RETURNING id`,
        [p.familyName, p.city],
      );
      familyId = created[0].id;
      report.familiesNew.push(p.projectCode);
    }

    await client.query(
      `INSERT INTO ee.projects
         (project_code, family_id, project_name, site_address, city, project_type,
          current_phase, rag_status, crmtl_id, design_fee_total, pmc_fee_total, project_value_est,
          first_instalment_date, target_dor_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7::project_phase, $8::rag_status, $9, $10, $11, $12, $13, $14)`,
      [
        p.projectCode, familyId, p.projectName, p.siteAddress, p.city, p.projectType,
        p.phase, p.rag, tlId, p.designFee, p.pmcFee, p.valueEst, p.firstInstalment, p.targetDor,
      ],
    );
    report.projectsAdded.push(p.projectCode);
  }

  for (const v of vendors.rows) {
    const { rows: exists } = await client.query(`SELECT 1 FROM proc.vendors WHERE lower(vrn_number) = lower($1)`, [v.vrn]);
    if (exists.length) {
      report.vendorsSkipped.push(v.vrn);
      continue;
    }
    await client.query(
      `INSERT INTO proc.vendors
         (vrn_number, company_name, contact_person, phone, email, vendor_type, trade_categories,
          vrn_status, vrn_issued_date, vrn_expiry_date, performance_score, is_preferred)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, $12)`,
      [v.vrn, v.company, v.contact, v.phone, v.email, v.type, JSON.stringify(v.trades), v.status, v.issued, v.expiry, v.score, v.preferred],
    );
    report.vendorsAdded.push(v.vrn);
  }

  if (dbProblems.length || !apply) {
    await client.query("ROLLBACK");
  } else {
    await client.query("COMMIT");
  }
} catch (err) {
  await client.query("ROLLBACK").catch(() => {});
  console.log(`  Nothing was imported. The database refused a row:\n\n    ${err.message}\n`);
  await client.end();
  process.exit(1);
}
await client.end();

if (dbProblems.length) {
  console.log("  Nothing was imported. Fix these and run it again:\n");
  for (const p of dbProblems) console.log(`    - ${p}`);
  console.log("");
  process.exit(1);
}

const list = (xs) => (xs.length ? xs.join(", ") : "none");
const verb = apply ? "added" : "would add";
const line = (label, n, detail) => console.log(`  ${label.padEnd(20)}: ${n}  (${detail})`);
line(`projects ${verb}`, report.projectsAdded.length, list(report.projectsAdded));
line("projects skipped", report.projectsSkipped.length, `already there: ${list(report.projectsSkipped)}`);
line("new families", report.familiesNew.length, `for ${list(report.familiesNew)}`);
line("families reused", report.familiesReused.length, list(report.familiesReused));
line(`vendors ${verb}`, report.vendorsAdded.length, list(report.vendorsAdded));
line("vendors skipped", report.vendorsSkipped.length, `already there: ${list(report.vendorsSkipped)}`);
console.log("");
console.log(apply ? "  Saved." : "  Preview only — nothing was saved. Add --apply to save exactly this.");
console.log("");
