/**
 * Set the HR team's portal passwords.
 *
 *   node db/set-hr-passwords.mjs
 *
 * Asks for a password for each HR account, hashes it with the same scrypt
 * scheme the app verifies against (lib/auth/password.ts), and writes
 * db/058_hr_team_accounts.sql containing ONLY the hashes.
 *
 * The passwords you type are never printed back, never stored, and never
 * written to the repository — only their hashes are, and a scrypt hash cannot
 * be turned back into the password. Whoever runs this is the only person who
 * knows them.
 *
 * WHY HR'S ACCOUNTS ARE NOT THE DESIGN TEAM'S. db/043 creates accounts that
 * open decks. These open candidate files: CVs, phone numbers, what somebody
 * earns now and what they are asking for. So two things are different and
 * both are deliberate:
 *
 *   · The department is HR, and that is load-bearing rather than tidy.
 *     db/049 grants hiring to HR BY DEPARTMENT, which is the only reason an
 *     L2 or L3 account can run hiring at all — there is no global grant, and
 *     db/049 raises an exception at migration time if one ever appears. An
 *     account created here without the HR department signs in fine and sees
 *     the word "Restricted".
 *
 *   · There is no sign-in-by-name. The design team's /design-team page lets
 *     somebody in by picking a name, which Monica chose knowingly for tracker
 *     data. Candidate data is fenced from the floor on purpose (§36), so
 *     /hr-team fills in the address and stops there. The password is still
 *     typed.
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
 * The HR team.
 *
 *   [email, name, level, job title]
 *
 * `name` is what the portal shows against anything this person does, so it is
 * the name they are called, not their address.
 *
 * `level` decides what they reach OUTSIDE hiring — inside it, the HR
 * department row in db/049 gives L2 and L3 exactly the same thing. So L2 is
 * for whoever runs the function and L3 for the rest, and getting it wrong
 * costs nothing on the hiring board.
 */
const PEOPLE = [
  ["hr.nandy@essentia.in", "Nandy", "L3", "essentia — HR"],
  ["hr.shivani@essentia.in", "Shivani", "L3", "essentia — HR"],
  ["hr.saurabh@essentia.in", "Saurabh", "L3", "essentia — HR"],
  ["hr.akash@essentia.in", "Akash", "L3", "essentia — HR"],
];

if (PEOPLE.length === 0) {
  console.log("");
  console.log("  Koi naam nahi hai is script me.");
  console.log("  PEOPLE list bharo (db/set-hr-passwords.mjs ke upar), phir chalao.");
  console.log("");
  process.exit(1);
}

const rl = createInterface({ input: process.stdin, output: process.stdout });

/* Once stdin has ended — piped input, or a Ctrl-D — every further question
   would throw. Treat it as an empty answer instead, so the run ends with the
   people it did get rather than a stack trace over the ones it did not. */
let closed = false;
rl.on("close", () => {
  closed = true;
});
const ask = (q) =>
  closed ? Promise.resolve("") : new Promise((res) => rl.question(q, res));

console.log("");
console.log("  HR team ke portal passwords");
console.log("  ---------------------------");
console.log("  Har account ke liye password likho (kam se kam 8 characters).");
console.log("  Ye screen par dikhega, isliye akele baith kar karna.");
console.log("  Khaali chhodoge to wo account skip ho jayega.");
console.log("");

const OUT = join(HERE, "058_hr_team_accounts.sql");

/* Somebody who is not being changed keeps the hash they already have, so a
   run that only resets one person does not wipe everybody else out of the
   file. Read back from the file, because it is the only place the hash is. */
const existing = new Map();
if (existsSync(OUT)) {
  const prev = readFileSync(OUT, "utf8");
  for (const m of prev.matchAll(
    /\('([^']+)',\s*'([^']+)',\s*'(L[0-3])',\s*'([^']*)',\s*'([0-9a-f]+:[0-9a-f]+)'\)/g,
  )) {
    existing.set(m[1].toLowerCase(), m[5]);
  }
}

const rows = [];
for (const [email, name, level, title] of PEOPLE) {
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
      rows.push({ email, name, level, title, hash: kept });
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
    name,
    level,
    title,
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
const values = rows
  .map(
    (r) =>
      `  ('${q(r.email)}', '${q(r.name)}', '${r.level}', '${q(r.title)}', '${r.hash}')`,
  )
  .join(",\n");

const sql = `-- =====================================================================
-- 058 — HR TEAM · ACCOUNTS AND PASSWORDS
--
--   Generated by db/set-hr-passwords.mjs. Do not hand-edit; re-run the
--   script to change a password.
--
--   These are scrypt hashes in the format lib/auth/password.ts verifies —
--   "<saltHex>:<keyHex>". A hash cannot be reversed into the password, so
--   this file is safe to commit. The passwords themselves were typed by
--   whoever ran the script and are recorded nowhere.
--
--   Two things happen here, and nothing else:
--     · the account exists (created if it does not), in the HR department;
--     · it signs in with a password, at /hr-login.
--
--   THE DEPARTMENT IS THE WHOLE POINT. db/049 grants hiring to HR BY
--   DEPARTMENT — a department row beating the level's global row — and there
--   is no global L2 or L3 grant, by design (§36: candidate data is never open
--   to the floor). An account created here WITHOUT the HR department signs in
--   perfectly well and then sees the word "Restricted". If somebody reports
--   that, this is the first thing to check.
--
--   Nobody is given anything else. Reaching the WIO tracker, the decks or the
--   factory is a row in those modules' own lists, not something this file
--   decides.
--
--   Idempotent — re-running sets the same hashes and adds nobody twice.
--   An existing account keeps whatever access level it already has: this file
--   does not demote somebody who was elevated in the portal on purpose.
--
--   ROLLBACK: these are real people's accounts. Deactivate rather than
--             delete — UPDATE public.users SET is_active = FALSE WHERE ...
-- =====================================================================

INSERT INTO public.users
  (email, full_name, display_name, access_level, department_id, job_title,
   auth_provider, password_hash)
SELECT v.email, v.name, v.name, v.level::access_level, d.id, v.title,
       'local', v.hash
  FROM (VALUES
${values}
  ) AS v(email, name, level, title, hash)
  LEFT JOIN public.departments d ON d.code = 'HR'
ON CONFLICT (email) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      auth_provider = 'local',
      is_active     = TRUE,
      -- The department is re-asserted because it is what grants hiring, and
      -- somebody moved out of HR by hand should not be quietly moved back by
      -- a password reset. It is set here only because this file IS the HR
      -- list: being in it is what says they are in HR.
      department_id = EXCLUDED.department_id;

-- Two things must hold, or somebody signs in to the word "Restricted".
DO $guards$
DECLARE
  homeless INTEGER;
  dept     INTEGER;
BEGIN
  SELECT count(*) INTO dept FROM public.departments WHERE code = 'HR';
  IF dept = 0 THEN
    RAISE EXCEPTION 'there is no HR department in the master (db/002)';
  END IF;

  SELECT count(*) INTO homeless
    FROM public.users u
    LEFT JOIN public.departments d ON d.id = u.department_id
   WHERE u.email IN (${rows.map((r) => `'${q(r.email.toLowerCase())}'`).join(", ")})
     AND (d.code IS DISTINCT FROM 'HR');
  IF homeless > 0 THEN
    RAISE EXCEPTION
      'an HR account is not in the HR department — it would see "Restricted" (% such)',
      homeless;
  END IF;
END $guards$;
`;

writeFileSync(OUT, sql, "utf8");

console.log(`  Likha: db/058_hr_team_accounts.sql  (${rows.length} log)`);
console.log("");
console.log("  Ab ye karo:");
console.log("    1. db/lib.mjs ke DEFAULT_FILES me '058_hr_team_accounts.sql' add karo");
console.log("    2. SIRF is file ko database pe chalao.");
console.log("       db/migrate.mjs mat chalao agar database me kaam pada hai —");
console.log("       wo saari files chalata hai, aur 901 design tracker ke");
console.log("       projects delete karke dobara daalta hai (ticks chale jayenge).");
console.log("    3. /hr-login pe sign in karke check karo");
console.log("");
console.log("  Passwords sirf tumhare paas hain. Yahan kahin nahi likhe gaye.");
console.log("");
