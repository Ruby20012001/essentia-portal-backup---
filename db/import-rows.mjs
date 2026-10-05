/**
 * Reading and checking the rows for db/import-projects-vendors.mjs — no
 * database here, so the rules are tested on their own
 * (frontend/tests/unit/import-rows.test.ts).
 *
 * A file is checked whole before anything is written: every problem is
 * reported with its line number, and one bad row stops the whole file.
 */

export const PHASES = [
  "discovery",
  "design_conceptualisation",
  "design_development",
  "design_finalisation",
  "procurement",
  "production",
  "site_preparation",
  "installation",
  "day_of_recognition",
];
export const RAGS = ["green", "amber", "red"];
export const PROJECT_TYPES = ["residential", "commercial", "hospitality"];
export const VENDOR_TYPES = ["contractor", "supplier", "specialist"];
export const VRN_STATUSES = ["active", "suspended", "revoked"];

export const PROJECT_COLUMNS = [
  "project_code",
  "project_name",
  "family_name",
  "city",
  "site_address",
  "project_type",
  "current_phase",
  "rag_status",
  "crm_tl_email",
  "design_fee_total",
  "pmc_fee_total",
  "project_value_est",
  "first_instalment_date",
  "target_dor_date",
];

export const VENDOR_COLUMNS = [
  "vrn_number",
  "company_name",
  "contact_person",
  "phone",
  "email",
  "vendor_type",
  "trade_categories",
  "vrn_status",
  "vrn_issued_date",
  "vrn_expiry_date",
  "performance_score",
  "is_preferred",
];

/** Columns this import refuses outright — they do not belong in a spreadsheet. */
export const REFUSED_COLUMNS = ["pan_number", "aadhaar_number", "bank_account", "bank_ifsc", "bank_name"];

/**
 * CSV as Excel writes it: optional BOM, CRLF or LF, quoted fields with ""
 * for a quote, commas and newlines allowed inside quotes. Returns rows of
 * strings; blank lines are dropped.
 */
export function parseCsv(text) {
  const src = text.replace(/^﻿/, "");
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

const norm = (h) => h.trim().toLowerCase().replace(/[\s-]+/g, "_");

/** Header row → objects keyed by column, with the CSV line number kept for messages. */
export function toRecords(rows) {
  if (rows.length === 0) return { header: [], records: [] };
  const header = rows[0].map(norm);
  const records = rows.slice(1).map((r, i) => {
    const rec = { line: i + 2 };
    header.forEach((h, j) => (rec[h] = (r[j] ?? "").trim()));
    return rec;
  });
  return { header, records };
}

function headerProblems(header, known, required) {
  const out = [];
  const refused = header.filter((h) => REFUSED_COLUMNS.includes(h));
  if (refused.length) {
    out.push(`remove the column(s) ${refused.join(", ")}: PAN, Aadhaar and bank details are not imported from a spreadsheet`);
  }
  for (const r of required) if (!header.includes(r)) out.push(`missing the column "${r}"`);
  const unknown = header.filter((h) => h && !known.includes(h) && !REFUSED_COLUMNS.includes(h));
  if (unknown.length) out.push(`unknown column(s) ${unknown.join(", ")} — check the spelling against the template`);
  return out;
}

/** An optional column left out of the file reads as blank, not as missing. */
const withBlanks = (rec, columns) => ({ ...Object.fromEntries(columns.map((c) => [c, ""])), ...rec });

const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
/** "12,50,000" or "₹ 12.5L" style is refused rather than guessed: plain digits only. */
const money = (s) => (/^\d+(\.\d{1,2})?$/.test(s) ? Number(s) : NaN);
const yes = (s) => ["yes", "y", "true", "1"].includes(s.toLowerCase());

/** Checks a projects file. Returns { problems, rows } — rows are only usable when problems is empty. */
export function checkProjects({ header, records }) {
  const problems = headerProblems(header, PROJECT_COLUMNS, ["project_code", "family_name", "site_address"]);
  if (problems.length) return { problems, rows: [] };
  const seen = new Map();
  const rows = [];
  for (const rec of records) {
    const r = withBlanks(rec, PROJECT_COLUMNS);
    const p = (msg) => problems.push(`line ${r.line}: ${msg}`);
    if (!r.project_code) p("project_code is empty");
    else if (r.project_code.length > 20) p("project_code is longer than 20 characters");
    else if (seen.has(r.project_code.toLowerCase())) p(`project_code ${r.project_code} is also on line ${seen.get(r.project_code.toLowerCase())}`);
    else seen.set(r.project_code.toLowerCase(), r.line);
    if (!r.family_name) p("family_name is empty");
    if (!r.site_address) p("site_address is empty");
    const phase = (r.current_phase || "discovery").toLowerCase().replace(/[\s-]+/g, "_");
    if (!PHASES.includes(phase)) p(`current_phase "${r.current_phase}" is not one of: ${PHASES.join(", ")}`);
    const rag = (r.rag_status || "green").toLowerCase();
    if (!RAGS.includes(rag)) p(`rag_status "${r.rag_status}" must be green, amber or red`);
    const type = r.project_type.toLowerCase();
    if (type && !PROJECT_TYPES.includes(type)) p(`project_type "${r.project_type}" must be residential, commercial or hospitality`);
    for (const k of ["design_fee_total", "pmc_fee_total", "project_value_est"]) {
      if (r[k] && Number.isNaN(money(r[k]))) p(`${k} "${r[k]}" must be a plain number of rupees, e.g. 1250000`);
    }
    for (const k of ["first_instalment_date", "target_dor_date"]) {
      if (r[k] && !isDate(r[k])) p(`${k} "${r[k]}" must be a date written YYYY-MM-DD`);
    }
    rows.push({
      line: r.line,
      projectCode: r.project_code,
      projectName: r.project_name || null,
      familyName: r.family_name,
      city: r.city || null,
      siteAddress: r.site_address,
      projectType: type || null,
      phase,
      rag,
      crmTlEmail: r.crm_tl_email ? r.crm_tl_email.toLowerCase() : null,
      designFee: r.design_fee_total ? money(r.design_fee_total) : null,
      pmcFee: r.pmc_fee_total ? money(r.pmc_fee_total) : null,
      valueEst: r.project_value_est ? money(r.project_value_est) : null,
      firstInstalment: r.first_instalment_date || null,
      targetDor: r.target_dor_date || null,
    });
  }
  return { problems, rows };
}

/** Checks a vendors file. Same contract as checkProjects. */
export function checkVendors({ header, records }) {
  const problems = headerProblems(header, VENDOR_COLUMNS, ["vrn_number", "company_name"]);
  if (problems.length) return { problems, rows: [] };
  const seen = new Map();
  const rows = [];
  for (const rec of records) {
    const r = withBlanks(rec, VENDOR_COLUMNS);
    const p = (msg) => problems.push(`line ${r.line}: ${msg}`);
    if (!r.vrn_number) p("vrn_number is empty");
    else if (r.vrn_number.length > 30) p("vrn_number is longer than 30 characters");
    else if (seen.has(r.vrn_number.toLowerCase())) p(`vrn_number ${r.vrn_number} is also on line ${seen.get(r.vrn_number.toLowerCase())}`);
    else seen.set(r.vrn_number.toLowerCase(), r.line);
    if (!r.company_name) p("company_name is empty");
    const type = r.vendor_type.toLowerCase();
    if (type && !VENDOR_TYPES.includes(type)) p(`vendor_type "${r.vendor_type}" must be contractor, supplier or specialist`);
    const status = (r.vrn_status || "active").toLowerCase();
    if (!VRN_STATUSES.includes(status)) p(`vrn_status "${r.vrn_status}" must be active, suspended or revoked`);
    for (const k of ["vrn_issued_date", "vrn_expiry_date"]) {
      if (r[k] && !isDate(r[k])) p(`${k} "${r[k]}" must be a date written YYYY-MM-DD`);
    }
    const score = r.performance_score ? Number(r.performance_score) : null;
    if (score !== null && !(score >= 0 && score <= 10)) p(`performance_score "${r.performance_score}" must be between 0 and 10`);
    if (r.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email)) p(`email "${r.email}" does not look like an email address`);
    if (r.phone && !/^[+\d][\d\s-]{6,19}$/.test(r.phone)) p(`phone "${r.phone}" does not look like a phone number`);
    rows.push({
      line: r.line,
      vrn: r.vrn_number,
      company: r.company_name,
      contact: r.contact_person || null,
      phone: r.phone || null,
      email: r.email || null,
      type: type || null,
      trades: r.trade_categories ? r.trade_categories.split(";").map((t) => t.trim()).filter(Boolean) : [],
      status,
      issued: r.vrn_issued_date || null,
      expiry: r.vrn_expiry_date || null,
      score,
      preferred: r.is_preferred ? yes(r.is_preferred) : false,
    });
  }
  return { problems, rows };
}
