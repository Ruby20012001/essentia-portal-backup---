/**
 * Set the WIO team's portal passwords.
 *
 *   node db/set-wio-passwords.mjs
 *
 * Asks for a password for each of the six, hashes it with the same scrypt
 * scheme the app verifies against (lib/auth/password.ts), and writes
 * db/060_wio_team_passwords.sql containing ONLY the hashes.
 *
 * The passwords you type are never printed back, never stored, and never
 * written to the repository — only their hashes are, and a scrypt hash cannot
 * be turned back into the password. Whoever runs this is the only person who
 * knows them.
 *
 * WHY THIS FILE EXISTS AT ALL. db/035 created these six for Microsoft
 * sign-in: `auth_provider = 'entra'`, no password. Entra token validation has
 * never been built, so today all three ways in are shut at once —
 *
 *   · password sign-in       the row has no hash, so it is refused
 *   · Microsoft sign-in      the portal cannot verify the token yet
 *   · Team passwords         lib/auth/team-reset.ts refuses any account that
 *                            is not 'local', and its list filters them out
 *
 * which is why the only six people who may change the tracker cannot reach
 * it. This moves them to a password they type, and nothing else about them
 * changes.
 *
 * WHAT THIS DOES NOT DO. It does not touch the department, the access level,
 * or any permission row. Tracker edit is granted in db/030 to L2 and L3 in
 * DRAFTING, and that is where it stays — this file only answers "how does
 * this person prove who they are", never "what may they do". The guards below
 * fail the migration if that line is ever crossed.
 *
 * IT IS A STEP BACK FROM SSO, ON PURPOSE. When Entra validation lands, these
 * accounts move to 'entra' again and this file is dropped from DEFAULT_FILES.
 * Until then a door that works beats a door that is planned.
 *
 * Re-run it any time to change a password; it rewrites the file, and the
 * migration updates the rows in place.
 */
import { randomBytes, scrypt } from "node:crypto";
import { promisify } from "node:util";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scryptAsync = promisify(scrypt);
const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * The WIO team, exactly as db/035 seeded them.
 *
 *   [email, name, level]
 *
 * The level is NOT set by this file — it is listed so the prompt says who you
 * are typing for, and so the guard can check nobody was quietly moved. L3 is
 * here deliberately: db/030 grants L3 full tracker edit, because the person
 * who moves a WIO along every morning is a draughtsman, not the HOD.
 */
const PEOPLE = [
  ["dipmallya.wio@essentia.in", "Dipmalya", "L2"],
  ["neeraj.wio@essentia.in", "Neeraj", "L2"],
  ["wio.vishal@essentia.in", "Vishal", "L2"],
  ["wio.anshul@essentia.in", "Anshul", "L3"],
  ["wio.atul@essentia.in", "Atul", "L3"],
  ["Jyoti.drafting@essentia.in", "Jyoti", "L3"],
];

const rl = createInterface({ input: process.stdin, output: process.stdout });

/* Once stdin has ended — piped input, or a Ctrl-D — every further question
   would throw. Treat it as an empty answer instead, so the run ends with the
   people it did get rather than a stack trace over the ones it did not.
   The close can also land while a question is already on screen, and that
   one never calls its callback; without the listener below the script hangs
   on a promise nothing will ever settle. */
let closed = false;
rl.on("close", () => {
  closed = true;
});
const ask = (q) =>
  new Promise((res) => {
    if (closed) return res("");
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      rl.off("close", onClose);
      res(value);
    };
    const onClose = () => finish("");
    rl.on("close", onClose);
    rl.question(q, finish);
  });

console.log("");
console.log("  WIO team ke portal passwords");
console.log("  ----------------------------");
console.log("  Har account ke liye password likho (kam se kam 8 characters).");
console.log("  Ye screen par dikhega, isliye akele baith kar karna.");
console.log("  Khaali chhodoge to wo account skip ho jayega.");
console.log("");
console.log("  Ek hi aadmi ka password bhi kaafi hai — wo andar jaakar baaki");
console.log("  paancho ke password portal ke apne 'Team passwords' se set kar");
console.log("  sakta hai, aur wahan password ek baar screen par dikhta hai.");
console.log("");

const OUT = join(HERE, "060_wio_team_passwords.sql");

/* Somebody who is not being changed keeps the hash they already have, so a
   run that only resets one person does not wipe everybody else out of the
   file. Read back from the file, because it is the only place the hash is. */
const existing = new Map();
if (existsSync(OUT)) {
  const prev = readFileSync(OUT, "utf8");
  for (const m of prev.matchAll(
    /\('([^']+)',\s*'([0-9a-f]+:[0-9a-f]+)'\)/g,
  )) {
    existing.set(m[1].toLowerCase(), m[2]);
  }
}

const rows = [];
for (const [email, name, level] of PEOPLE) {
  let pw = "";
  while (true) {
    pw = (await ask(`  ${name} (${level})\n    password: `)).trim();
    if (pw === "") break;
    if (pw.length < 8) {
      console.log("    -> kam se kam 8 characters chahiye. Dobara.\n");
      continue;
    }
    break;
  }
  if (pw === "") {
    const kept = existing.get(email.toLowerCase());
    if (kept) {
      rows.push({ email, hash: kept });
      console.log("    -> pehle jaisa hi rakha\n");
    } else {
      console.log("    -> skipped\n");
    }
    continue;
  }
  const salt = randomBytes(16);
  const key = await scryptAsync(pw, salt, 64);
  rows.push({
    email,
    hash: `${salt.toString("hex")}:${key.toString("hex")}`,
  });
  console.log("    -> set\n");
}
rl.close();

if (rows.length === 0) {
  console.log("  Kuch set nahi hua. Koi file nahi likhi.\n");
  process.exit(0);
}

const q = (s) => String(s).replace(/'/g, "''");
const values = rows.map((r) => `  ('${q(r.email)}', '${r.hash}')`).join(",\n");
const emailList = rows.map((r) => `'${q(r.email.toLowerCase())}'`).join(", ");

const sql = `-- =====================================================================
-- 060 — WIO TEAM · A PASSWORD THEY CAN ACTUALLY TYPE
--
--   Generated by db/set-wio-passwords.mjs. Do not hand-edit; re-run the
--   script to change a password.
--
--   These are scrypt hashes in the format lib/auth/password.ts verifies —
--   "<saltHex>:<keyHex>". A hash cannot be reversed into the password, so
--   this file is safe to commit. The passwords themselves were typed by
--   whoever ran the script and are recorded nowhere.
--
--   WHY. db/035 created these six for Microsoft sign-in — 'entra', no
--   password — and Entra validation was never built. So all three doors were
--   shut at once: password sign-in had no hash to check, Microsoft sign-in
--   had no verifier, and Team passwords (lib/auth/team-reset.ts) refuses any
--   account that is not 'local'. The only six people allowed to change the
--   tracker could not reach it.
--
--   ONE THING HAPPENS HERE, AND NOTHING ELSE: how these six prove who they
--   are. Department, access level and every permission row are untouched.
--   Tracker edit is db/030's grant to L2 and L3 in DRAFTING and stays there.
--
--   UPDATE ONLY — never INSERT. If an email here does not exist, that is a
--   typo or a renamed account, and creating a second account for the same
--   person is worse than failing. The guard below raises instead.
--
--   Idempotent. Re-running sets the same hashes.
--
--   WHEN ENTRA LANDS: set auth_provider back to 'entra', clear the hashes,
--   and drop this file from db/lib.mjs DEFAULT_FILES.
--
--   ROLLBACK: UPDATE public.users
--                SET auth_provider = 'entra', password_hash = NULL
--              WHERE lower(email) IN (${emailList});
-- =====================================================================

UPDATE public.users u
   SET password_hash = v.hash,
       auth_provider = 'local',
       failed_logins = 0,
       locked_until  = NULL,
       is_active     = TRUE,
       updated_at    = NOW()
  FROM (VALUES
${values}
  ) AS v(email, hash)
 WHERE lower(u.email) = lower(v.email);

-- Three things must hold, or somebody signs in and the tracker is read-only.
DO $guards$
DECLARE
  missing  INTEGER;
  homeless INTEGER;
  unset    INTEGER;
BEGIN
  SELECT ${rows.length} - count(*) INTO missing
    FROM public.users
   WHERE lower(email) IN (${emailList});
  IF missing > 0 THEN
    RAISE EXCEPTION
      'a WIO team email in db/060 has no account (% missing) — check the spelling against db/035',
      missing;
  END IF;

  SELECT count(*) INTO homeless
    FROM public.users u
    LEFT JOIN public.departments d ON d.id = u.department_id
   WHERE lower(u.email) IN (${emailList})
     AND (d.code IS DISTINCT FROM 'DRAFTING');
  IF homeless > 0 THEN
    RAISE EXCEPTION
      'a WIO account is not in DRAFTING — it would sign in and find the tracker read-only (% such)',
      homeless;
  END IF;

  SELECT count(*) INTO unset
    FROM public.users
   WHERE lower(email) IN (${emailList})
     AND (password_hash IS NULL OR auth_provider <> 'local');
  IF unset > 0 THEN
    RAISE EXCEPTION
      'a WIO account still cannot sign in after this file ran (% such)',
      unset;
  END IF;
END $guards$;
`;

writeFileSync(OUT, sql, "utf8");

console.log(`  Likha: db/060_wio_team_passwords.sql  (${rows.length} log)`);
console.log("");
console.log("  Ab ye karo:");
console.log("    1. db/lib.mjs ke DEFAULT_FILES me '060_wio_team_passwords.sql' add karo");
console.log("    2. SIRF is file ko database pe chalao.");
console.log("       db/migrate.mjs mat chalao agar database me kaam pada hai —");
console.log("       wo saari files chalata hai, aur 901 design tracker ke");
console.log("       projects delete karke dobara daalta hai (ticks chale jayenge).");
console.log("    3. /login pe sign in karke check karo, phir WIOs tab pe Edit dikhna chahiye");
console.log("");
console.log("  Passwords sirf tumhare paas hain. Yahan kahin nahi likhe gaye.");
console.log("");
