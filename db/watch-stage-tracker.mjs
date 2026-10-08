/**
 * Watch the MASTER TRACKER and sync the Stage Tracker the moment it is saved
 * (Monica, 8 Oct: "jab bhi wo file mein updation ho to isme automatic ho,
 * warna clash karengi cheezein").
 *
 *   node db/watch-stage-tracker.mjs
 *
 * Started at sign-in by Task Scheduler (task "Essentia Stage Tracker Watch",
 * through db/watch-stage-tracker.vbs so no window stays open).
 *
 * HOW IT NOTICES. fs.watch is not reliable on a network share, so it polls the
 * file's size and modified time every 15 seconds — cheap, one stat call. When
 * either moves it waits for them to hold still for 10 seconds (Excel writes a
 * save in more than one step) and then runs sync-stage-tracker.mjs --apply
 * --if-changed --env-local. That script brings across only the cells the
 * spreadsheet changed, so a cell typed on the board is not undone.
 *
 * One watcher at a time: a second start finds the first's pid in watch.pid
 * still alive and leaves.
 *
 * Log: %LOCALAPPDATA%\essentia\stage-sync\sync.log
 */
import { appendFileSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE = process.env.TRACKER_FILE ??
  "\\\\Manager\\D\\ID\\Jiya maitrey\\MASTER TRACKER (2).xlsx";
const STATE_DIR = process.env.STAGE_SYNC_DIR ??
  join(process.env.LOCALAPPDATA ?? HERE, "essentia", "stage-sync");
const LOG = join(STATE_DIR, "sync.log");
const PID = join(STATE_DIR, "watch.pid");
const POLL_MS = 15_000;
const SETTLE_MS = 10_000;

mkdirSync(STATE_DIR, { recursive: true });
const log = (line) => appendFileSync(LOG, `  ${new Date().toISOString()}  [watch] ${line}\n`);

try {
  const other = Number(readFileSync(PID, "utf8"));
  if (other && other !== process.pid) {
    process.kill(other, 0); // throws when it is not running
    console.log(`  already watching (pid ${other})`);
    process.exit(0);
  }
} catch { /* no live watcher */ }
writeFileSync(PID, String(process.pid));

let running = false;
let again = false;
function sync(reason) {
  if (running) { again = true; return; }
  running = true;
  log(`sync — ${reason}`);
  const child = spawn(process.execPath,
    [join(HERE, "sync-stage-tracker.mjs"), "--apply", "--if-changed", "--env-local"],
    { cwd: join(HERE, ".."), env: { ...process.env, NODE_NO_WARNINGS: "1" }, windowsHide: true });
  const out = (d) => appendFileSync(LOG, d);
  child.stdout.on("data", out);
  child.stderr.on("data", out);
  child.on("close", (code) => {
    if (code) log(`sync exited ${code} — will try again on the next change or in 15 minutes`);
    running = false;
    if (again) { again = false; sync("changed again while syncing"); }
  });
}

const look = () => {
  try {
    const s = statSync(SOURCE);
    return `${s.size}:${s.mtimeMs}`;
  } catch {
    return null; // the share is unreachable for now; try on the next poll
  }
};

let seen = look();
let settleTimer = null;
log(`watching ${SOURCE}${seen ? "" : " (not reachable yet)"}`);
sync("watcher started");

setInterval(() => {
  const now = look();
  if (!now || now === seen) return;
  seen = now;
  clearTimeout(settleTimer);
  settleTimer = setTimeout(() => {
    if (look() === seen) sync("the tracker was saved");
    else seen = null; // still being written; the next poll picks it up
  }, SETTLE_MS);
}, POLL_MS);

/* A safety net: a save missed while the share was unreachable, or a sync that
   failed, is caught within a quarter of an hour. --if-changed makes it free
   when there is nothing new. */
setInterval(() => sync("quarter-hourly check"), 15 * 60_000);
