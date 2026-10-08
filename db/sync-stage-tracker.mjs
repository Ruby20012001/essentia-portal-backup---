/**
 * Fill the Stage Tracker (/stage-board, db/064) from the office's MASTER
 * TRACKER — the ID, 3D and Architecture phases of its MASTER SHEET — and
 * on every later run, bring across what changed in it.
 *
 *   $env:DATABASE_URL="postgres://..."
 *   node db/sync-stage-tracker.mjs            # dry run: prints, changes nothing
 *   node db/sync-stage-tracker.mjs --apply    # writes it
 *
 * Run it after the spreadsheet is updated (daily). Rows whose cells changed
 * get a fresh updated_at, which is what the board's "Aaj ke updates" reads.
 *
 * WHICH COLUMN GOES WHERE (row 6 onwards; headers are rows 1–4):
 *
 *   ID            B project · J team member · H current status
 *                 Layout: K start · L end · O sign off
 *                 Vibe:   AD (one cell)  ┐ "sent: … approved: …" is split at
 *                 Camera: P  (one cell)  ┘ "approved"/"signoff": the sent part
 *                                          is Start, the rest is Signoff
 *   3D            AI team member · AJ start · AL end · AK stage → status
 *   Architecture  S team member · U technical drawings · V boundbook ·
 *                 W ext. GFCs · T start and X end → status
 *
 * A project appears on the 3D and Architecture tabs only if the spreadsheet
 * has something in that phase's columns. Every project with a name is on ID.
 *
 * WHAT IT WILL NOT DO
 *   · delete. A project gone from the spreadsheet is reported and left.
 *   · blank a cell. An empty cell in the spreadsheet leaves the board's value
 *     alone — somebody may have typed it on the board.
 *   · undo a change typed on the board. It remembers what the spreadsheet
 *     said last time (a snapshot, see STATE_DIR) and brings across only the
 *     cells the SPREADSHEET has changed since. A cell edited on the board and
 *     untouched in the spreadsheet stays as typed. With no snapshot yet (the
 *     first run) every differing non-empty cell is brought across.
 *
 * AUTOMATIC (Monica, 8 Oct: "tracker mein changes ho to automatically isme
 * bhi ho"). The spreadsheet is on \\Manager, which the cloud cannot see, so
 * Task Scheduler on this laptop runs db/run-stage-sync.cmd every few minutes:
 *
 *   --if-changed   stop at once when the file's size and modified time are
 *                  the same as at the last successful sync
 *   --env-local    take DATABASE_URL from frontend/.env.local when it is not
 *                  set — so the scheduled task holds no connection string
 */
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";
import pg from "pg";

const SOURCE = process.env.TRACKER_FILE ??
  "\\\\Manager\\D\\ID\\Jiya maitrey\\MASTER TRACKER (2).xlsx";
const SHEET = 1;              // MASTER SHEET
const FIRST_ROW = 6;
const APPLY = process.argv.includes("--apply");
const IF_CHANGED = process.argv.includes("--if-changed");
const STATE_DIR = process.env.STAGE_SYNC_DIR ??
  join(process.env.LOCALAPPDATA ?? dirname(fileURLToPath(import.meta.url)), "essentia", "stage-sync");
const STATE_FILE = join(STATE_DIR, "state.json");

if (process.argv.includes("--env-local") && !process.env.DATABASE_URL) {
  const env = join(dirname(fileURLToPath(import.meta.url)), "..", "frontend", ".env.local");
  const line = readFileSync(env, "utf8").split(/\r?\n/).find((l) => /^DATABASE_URL=/.test(l));
  if (line) process.env.DATABASE_URL = line.slice("DATABASE_URL=".length).trim();
}

let state = null;
try { state = JSON.parse(readFileSync(STATE_FILE, "utf8")); } catch { /* first run */ }
let fileStat;
try {
  const s = statSync(SOURCE);
  fileStat = { mtime: s.mtimeMs, size: s.size };
} catch (err) {
  console.error(`\n  ${new Date().toISOString()}  cannot see the tracker: ${err.message}\n`);
  process.exit(1);
}
if (IF_CHANGED && state?.snapshot && state.mtime === fileStat.mtime && state.size === fileStat.size) {
  console.log(`  ${new Date().toISOString()}  tracker unchanged — nothing to do`);
  process.exit(0);
}

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

/* A cell that is only an Excel day number (45849) reads as a date. */
const text = (v) => {
  const t = tidy(v);
  if (/^\d{5}(\.\d+)?$/.test(t)) {
    const d = excelDate(t);
    if (d) {
      return new Date(d + "T00:00:00Z").toLocaleDateString("en-IN", {
        day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
      });
    }
  }
  return t.slice(0, 2000);
};

/* "sent: 17th july approved: 20th" → ["sent: 17th july", "approved: 20th"] */
function splitSignoff(v) {
  const t = text(v);
  if (!t) return ["", ""];
  const at = t.search(/approv|sign\s*-?\s*off|singoff/i);
  if (at < 0) return [t, ""];
  if (at === 0) return ["", t];
  return [t.slice(0, at).replace(/[\s,;:]+$/, ""), t.slice(at)];
}

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
const lastRow = Math.max(...Object.keys(sheet).map((k) => +k.match(/\d+/)[0]));
const at = (col, r) => text(sheet[col + r]);

const wanted = { id: [], "3d": [], arch: [] };
for (let r = FIRST_ROW; r <= lastRow; r += 1) {
  const project = tidy(sheet["B" + r]).slice(0, 200);
  if (!project) continue;
  const [vibeStart, vibeSignoff] = splitSignoff(sheet["AD" + r]);
  const [camStart, camSignoff] = splitSignoff(sheet["P" + r]);
  wanted.id.push({
    row: r, project,
    member: at("J", r).slice(0, 120), status: at("H", r),
    layout_start: at("K", r), layout_end: at("L", r), layout_signoff: at("O", r),
    vibe_start: vibeStart, vibe_signoff: vibeSignoff,
    cam_start: camStart, cam_signoff: camSignoff,
  });
  const d3 = {
    row: r, project,
    member: at("AI", r).slice(0, 120), start_date: at("AJ", r), end_date: at("AL", r), status: at("AK", r),
  };
  if (d3.member || d3.start_date || d3.end_date || d3.status) wanted["3d"].push(d3);
  const span = [at("T", r) && `Start: ${at("T", r)}`, at("X", r) && `End: ${at("X", r)}`]
    .filter(Boolean).join(" · ");
  const ar = {
    row: r, project,
    member: at("S", r).slice(0, 120), status: span,
    tech_drawings: at("U", r), boundbook: at("V", r), ext_gfc: at("W", r),
  };
  if (ar.member || ar.status || ar.tech_drawings || ar.boundbook || ar.ext_gfc) wanted.arch.push(ar);
}
console.log("");
console.log(`  tracker : ${SOURCE}`);
console.log(`  read    : ID ${wanted.id.length} · 3D ${wanted["3d"].length} · Architecture ${wanted.arch.length}`);
if (!wanted.id.length) {
  console.error("\n  Nothing read. The sheet or its columns have moved — see the table at the top.\n");
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

const exists = (await db.query(`SELECT to_regclass('ee.stage_tracker_rows') AS t`)).rows[0].t;
if (!exists) {
  console.error("  ee.stage_tracker_rows is not there yet. Run db/apply-stage-tracker.mjs first.\n");
  await db.end();
  process.exit(1);
}
const onBoard = (await db.query(`SELECT * FROM ee.stage_tracker_rows`)).rows;
const key = (d, p) => `${d}|${tidy(p).toLowerCase()}`;
const boardBy = new Map(onBoard.map((r) => [key(r.discipline, r.project), r]));

/* What the spreadsheet said last time, by row key. A cell equal to it has not
   changed in the spreadsheet, so the board's value — perhaps typed there —
   stands. A row in it that is no longer on the board was removed on the
   board, and is not put back. */
const before = state?.snapshot ?? null;
const snapshot = {};

const plan = { add: [], change: [], twice: [] };
const seen = new Set();
for (const [discipline, list] of Object.entries(wanted)) {
  for (const w of list) {
    const k = key(discipline, w.project);
    if (seen.has(k)) { plan.twice.push({ discipline, ...w }); continue; }
    seen.add(k);
    const have = boardBy.get(k);
    const fields = Object.fromEntries(
      Object.entries(w).filter(([f, v]) => f !== "row" && f !== "project" && v));
    snapshot[k] = fields;
    const was = before?.[k];
    if (!have) {
      if (!was) plan.add.push({ discipline, project: w.project, fields });
      continue;
    }
    const diff = Object.entries(fields).filter(
      ([f, v]) => (have[f] ?? "") !== v && (!before || was?.[f] !== v));
    if (diff.length) plan.change.push({ discipline, project: w.project, id: have.id, diff, have });
  }
}
const gone = onBoard.filter((r) => !seen.has(key(r.discipline, r.project)));

const TAB = { id: "ID", "3d": "3D", arch: "Arch" };
const show = (title, list, line) => {
  console.log(`  ${title} — ${list.length}`);
  list.slice(0, 40).forEach((x) => console.log(line(x)));
  if (list.length > 40) console.log(`    …and ${list.length - 40} more`);
  console.log("");
};
show("rows to add", plan.add, (a) => `  · [${TAB[a.discipline]}] ${a.project}`);
show("rows to change", plan.change, (c) =>
  `  · [${TAB[c.discipline]}] ${c.project}: ` +
  c.diff.map(([f, v]) => `${f} "${String(c.have[f] ?? "—").slice(0, 30)}" → "${v.slice(0, 30)}"`).join("; "));
show("on the board, not in the tracker (left alone)", gone, (r) => `  · [${TAB[r.discipline]}] ${r.project}`);
show("in the tracker twice (the first is the one)", plan.twice,
  (t) => `  · row ${t.row} [${TAB[t.discipline]}] ${t.project}`);

if (!APPLY) {
  console.log("  Nothing was changed. Run it again with --apply to write this.\n");
  await db.end();
  process.exit(0);
}

try {
  await db.query("BEGIN");
  for (const a of plan.add) {
    const cols = ["discipline", "project", ...Object.keys(a.fields)];
    const vals = [a.discipline, a.project, ...Object.values(a.fields)];
    await db.query(
      `INSERT INTO ee.stage_tracker_rows (${cols.join(", ")})
       VALUES (${cols.map((_, i) => `$${i + 1}`).join(", ")})`, vals);
  }
  for (const c of plan.change) {
    await db.query(
      `UPDATE ee.stage_tracker_rows
          SET ${c.diff.map(([f], i) => `${f} = $${i + 2}`).join(", ")}, updated_at = NOW()
        WHERE id = $1`,
      [c.id, ...c.diff.map(([, v]) => v)]);
  }
  await db.query("COMMIT");
} catch (err) {
  await db.query("ROLLBACK").catch(() => {});
  console.error(`\n  FAILED — nothing was written.\n  ${err.message}\n`);
  await db.end();
  process.exit(1);
}

/* Only after the write has committed: a failed run must be tried again next
   time, not skipped as "unchanged". */
mkdirSync(STATE_DIR, { recursive: true });
writeFileSync(STATE_FILE, JSON.stringify({
  ...fileStat, syncedAt: new Date().toISOString(), snapshot,
}));

const counts = (await db.query(
  `SELECT discipline, count(*)::int AS n FROM ee.stage_tracker_rows GROUP BY discipline`)).rows;
console.log(`  done — ${plan.add.length} row(s) added, ${plan.change.length} changed.`);
console.log(`  the board now holds ${counts.map((c) => `${TAB[c.discipline]} ${c.n}`).join(" · ")}.\n`);
await db.end();
