/**
 * Bring the design board up to date from the master tracker.
 *
 *   node --env-file=../frontend/.env.local sync-design-tracker.mjs
 *   node --env-file=../frontend/.env.local sync-design-tracker.mjs --apply
 *
 * The record of what the design team is working on is a spreadsheet one of
 * them keeps — \\Manager\D\ID\Jiya maitrey\MASTER TRACKER (2).xlsx, a hundred
 * and nine projects on 7 Oct 2026, edited the same afternoon. The board was
 * filled by hand once, from the ID folders, and has seventeen. This reads the
 * spreadsheet and puts the difference on the board.
 *
 * WHY NOT THE FOLDERS. That was the first plan, and the folders will not
 * carry it: beside the real work they hold "New folder (2)", loose .dwg and
 * .bak files, and a name typed twenty characters of the same letter. A script
 * reading those makes a board nobody can read. The spreadsheet has the name
 * the office uses, who is on it and when it started, in named columns.
 *
 * WHY IT IS NOT AUTOMATIC. The portal is on Vercel and Neon; that spreadsheet
 * is on an office network drive. The cloud cannot see the drive. So this runs
 * on a machine in the office — by hand when something changes, or every
 * morning from Task Scheduler. There is no third option until the spreadsheet
 * moves somewhere the portal can reach.
 *
 * WHAT IT WILL NOT DO
 *   · delete anything. A project that has left the spreadsheet stays on the
 *     board and is reported, because a row somebody tidied away is not the
 *     same as a project that ended.
 *   · tick activities. The spreadsheet's phase dates are not the board's
 *     ninety-three sub-points, and guessing which are done from a date would
 *     put work on the board nobody did. The designers tick their own.
 *   · make portal accounts. A name in the spreadsheet with nobody behind it
 *     becomes a person on the board with no sign-in (user_id stays NULL), so
 *     the project has an owner on screen and still nobody gained access.
 *
 * It prints what it would change and changes nothing, until --apply.
 */
import { readFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";
import pg from "pg";

const SOURCE = process.env.TRACKER_FILE ??
  "\\\\Manager\\D\\ID\\Jiya maitrey\\MASTER TRACKER (2).xlsx";
const SHEET = 1;              // MASTER SHEET, the first of the four
const FIRST_ROW = 6;          // rows 1–4 are the merged headers, 5 is blank
const APPLY = process.argv.includes("--apply");

/* The columns, as the header rows name them. If the spreadsheet is ever
   rearranged these are the lines to change, and the run will say so: a
   column that has moved shows up as every project losing its designer. */
const COL = {
  name: "B",          // PROJECT LIST
  status: "H",        // CURRENT STATUS
  designer: "J",      // DESIGN TEAM MEMBER
  start: "K",         // PHASE 1 · STARTING DATE
};

/* ── reading the file ────────────────────────────────────────────────────
   An .xlsx is a zip of XML. Rather than take a dependency for one script on
   a laptop, the two pieces needed are read by hand: the central directory,
   and raw deflate, which node already has. */
function unzip(buf) {
  /* the end-of-central-directory record, last 22 bytes unless there is a
     comment — scan back for its signature */
  let end = buf.length - 22;
  while (end >= 0 && buf.readUInt32LE(end) !== 0x06054b50) end -= 1;
  if (end < 0) throw new Error("Not a zip file — is that really the .xlsx?");
  const count = buf.readUInt16LE(end + 10);
  let at = buf.readUInt32LE(end + 16);
  const files = {};
  for (let i = 0; i < count; i += 1) {
    if (buf.readUInt32LE(at) !== 0x02014b50) break;
    const method = buf.readUInt16LE(at + 10);
    const size = buf.readUInt32LE(at + 24);
    const nameLen = buf.readUInt16LE(at + 28);
    const extraLen = buf.readUInt16LE(at + 30);
    const commentLen = buf.readUInt16LE(at + 32);
    const localAt = buf.readUInt32LE(at + 42);
    const name = buf.toString("utf8", at + 46, at + 46 + nameLen);
    /* the local header repeats the name and extra fields, at its own lengths */
    const lNameLen = buf.readUInt16LE(localAt + 26);
    const lExtraLen = buf.readUInt16LE(localAt + 28);
    const from = localAt + 30 + lNameLen + lExtraLen;
    const raw = buf.subarray(from, from + size);
    files[name] = method === 0 ? raw : inflateRawSync(raw);
    at += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

const ENTITY = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
function unxml(s) {
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-z]+);/g, (whole, body) => {
    if (body[0] === "#") {
      const n = body[1] === "x" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : whole;
    }
    return ENTITY[body] ?? whole;
  });
}

/* <si> may be one <t>, or a run of them when part of the text is styled */
function sharedStrings(xml) {
  if (!xml) return [];
  return [...xml.toString("utf8").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
    [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => unxml(t[1])).join(""));
}

/** Every non-empty cell of a sheet, as { B6: "ELAN THE STATEMENT", … }. */
function cells(xml, strings) {
  const out = {};
  for (const m of xml.toString("utf8").matchAll(/<c ([^>]*?)\/?>([\s\S]*?)(?=<c |<\/row>)/g)) {
    const at = /r="([A-Z]+\d+)"/.exec(m[1]);
    if (!at) continue;
    const type = /t="([^"]+)"/.exec(m[1])?.[1];
    if (type === "inlineStr") {
      const t = /<t[^>]*>([\s\S]*?)<\/t>/.exec(m[2]);
      if (t) out[at[1]] = unxml(t[1]);
      continue;
    }
    const v = /<v>([\s\S]*?)<\/v>/.exec(m[2]);
    if (!v) continue;
    out[at[1]] = type === "s" ? (strings[+v[1]] ?? "") : unxml(v[1]);
  }
  return out;
}

/* Excel counts days from 1900, with a leap day that year that never was —
   so day 1 is 1 Jan 1900 and the epoch to count from is 30 Dec 1899. */
function excelDate(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 1 || n > 80000) return null;
  const ms = Date.UTC(1899, 11, 30) + Math.round(n) * 86400000;
  return new Date(ms).toISOString().slice(0, 10);
}

const tidy = (v) => String(v ?? "").replace(/\s+/g, " ").trim();
/* "RITU/HARSHARAN" is two people sharing a project; the board holds one, and
   the first named is the one who answers for it. "ARUSHI(ARYAN)" is the same
   shape with the second name in brackets. */
const firstNamed = (v) => tidy(v).split(/[\/,(]/)[0].trim();
const same = (a, b) => tidy(a).toLowerCase() === tidy(b).toLowerCase();

/* ── read it ─────────────────────────────────────────────────────────── */
let book;
try {
  book = unzip(readFileSync(SOURCE));
} catch (err) {
  console.error(`\n  Could not read the tracker.\n  ${SOURCE}\n  ${err.message}\n`);
  console.error("  On a machine that cannot see \\\\Manager, set TRACKER_FILE to a copy.\n");
  process.exit(1);
}
const strings = sharedStrings(book["xl/sharedStrings.xml"]);
const sheet = cells(book[`xl/worksheets/sheet${SHEET}.xml`], strings);

const wanted = [];
for (let r = FIRST_ROW; r < FIRST_ROW + 4000; r += 1) {
  const name = tidy(sheet[COL.name + r]);
  if (!name) continue;
  wanted.push({
    row: r,
    name,
    designer: firstNamed(sheet[COL.designer + r]),
    start: excelDate(sheet[COL.start + r]),
    status: tidy(sheet[COL.status + r]).slice(0, 400),
  });
}

console.log(`\n  tracker : ${SOURCE}`);
console.log(`  read    : ${wanted.length} project(s)`);
if (!wanted.length) {
  console.error("\n  Nothing read. The sheet or its columns have moved — see COL at the top.\n");
  process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) { console.error("\n  DATABASE_URL is not set.\n"); process.exit(1); }
console.log(`  board   : ${url.replace(/\/\/[^@]+@/, "//****@")}`);
console.log(`  mode    : ${APPLY ? "APPLY — the board will be changed" : "dry run — nothing will be changed"}\n`);

const db = new pg.Client({
  connectionString: url,
  ssl: /localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: false },
});
await db.connect();

const people = (await db.query(
  "SELECT id, name, role FROM ee.design_tracker_people ORDER BY sort_order, name")).rows;
const onBoard = (await db.query(
  `SELECT p.id, p.name, p.start_date::TEXT, p.designer_id, d.name AS designer
     FROM ee.design_projects p JOIN ee.design_tracker_people d ON d.id = p.designer_id`)).rows;

const personBy = new Map(people.map((p) => [tidy(p.name).toLowerCase(), p]));
const projectBy = new Map(onBoard.map((p) => [tidy(p.name).toLowerCase(), p]));
/* The head is not a designer and nothing is filed under her (the board
   refuses it on the way in, too) — so she is never a match for a name. */
const head = people.find((p) => p.role === "head");

const newPeople = [];
for (const w of wanted) {
  if (!w.designer) continue;
  const key = w.designer.toLowerCase();
  if (personBy.has(key) || newPeople.some((n) => n.toLowerCase() === key)) continue;
  newPeople.push(w.designer);
}

/* Two names the same is the spreadsheet holding the project twice — CLINIC
   GURGAON on rows 22 and 82, RIDHIMA JAIN on 63 and 70. The board holds one
   project of a name, so the first is the one and the rest are reported,
   rather than the two of them quietly swapping the row on every run. */
const twice = [];
const newProjects = [];
const changed = [];
const unowned = [];
const seen = new Set();
for (const w of wanted) {
  const key = w.name.toLowerCase();
  if (seen.has(key)) { twice.push(w); continue; }
  seen.add(key);
  const have = projectBy.get(key);
  /* Nobody named, no row: designer_id is NOT NULL, and a project filed
     under nobody is not one anybody picks up. Reported every run, because
     the fix is a name typed into the spreadsheet. */
  if (!w.designer) { unowned.push(w.name); continue; }
  if (!have) { newProjects.push(w); continue; }
  const bits = [];
  if (w.designer && !same(w.designer, have.designer)) {
    bits.push(`designer ${have.designer} → ${w.designer}`);
  }
  if (w.start && w.start !== have.start_date) {
    bits.push(`start ${have.start_date ?? "—"} → ${w.start}`);
  }
  if (bits.length) changed.push({ ...w, have, bits });
}
const gone = onBoard.filter((p) => !wanted.some((w) => same(w.name, p.name)));

const show = (title, list, line = (x) => `  · ${x}`) => {
  console.log(`  ${title} — ${list.length}`);
  list.slice(0, 40).forEach((x) => console.log(line(x)));
  if (list.length > 40) console.log(`    …and ${list.length - 40} more`);
  console.log("");
};

show("people to add to the board (no sign-in)", newPeople);
show("projects to add", newProjects, (p) => `  · ${p.name}  [${p.designer || "nobody named"}]`);
show("projects to change", changed, (p) => `  · ${p.name}: ${p.bits.join("; ")}`);
show("on the board, not in the tracker (left alone)", gone, (p) => `  · ${p.name} [${p.designer}]`);
show("in the tracker twice (the first is the one)", twice, (p) => `  · row ${p.row}  ${p.name}`);
show("skipped — the tracker names nobody on them", unowned);

if (!APPLY) {
  console.log("  Nothing was changed. Run it again with --apply to write this.\n");
  await db.end();
  process.exit(0);
}

let added = 0, updated = 0, made = 0;
try {
  await db.query("BEGIN");

  for (const name of newPeople) {
    /* No user_id: a name the board can file work under, and nobody who can
       sign in. Giving somebody access is a separate decision, taken by a
       person, not by a spreadsheet. */
    const { rows } = await db.query(
      `INSERT INTO ee.design_tracker_people (name, role, sort_order, user_id)
       VALUES ($1, 'designer', 500, NULL)
       ON CONFLICT (name) DO UPDATE SET is_active = TRUE
       RETURNING id, name, role`, [name]);
    personBy.set(tidy(rows[0].name).toLowerCase(), rows[0]);
    made += 1;
  }

  for (const p of newProjects) {
    const who = personBy.get(p.designer.toLowerCase());
    if (!who || (head && who.id === head.id)) continue;
    await db.query(
      `INSERT INTO ee.design_projects (name, designer_id, start_date, notes)
       VALUES ($1, $2, $3, $4)`,
      [p.name, who.id, p.start, p.status || null]);
    added += 1;
  }

  for (const c of changed) {
    const who = c.designer ? personBy.get(c.designer.toLowerCase()) : null;
    await db.query(
      `UPDATE ee.design_projects
          SET designer_id = COALESCE($2, designer_id),
              start_date  = COALESCE($3, start_date),
              updated_at  = NOW()
        WHERE id = $1`,
      [c.have.id, who && (!head || who.id !== head.id) ? who.id : null, c.start]);
    updated += 1;
  }

  await db.query("COMMIT");
} catch (err) {
  await db.query("ROLLBACK").catch(() => {});
  console.error(`\n  FAILED — nothing was written.\n  ${err.message}\n`);
  await db.end();
  process.exit(1);
}

const total = (await db.query("SELECT count(*)::int AS n FROM ee.design_projects")).rows[0].n;
console.log(`  done — ${made} person(s) added, ${added} project(s) added, ${updated} changed.`);
console.log(`  the board now holds ${total} project(s).\n`);
await db.end();
