/**
 * Give the view-only people a password, then shut the open door.
 *
 *   node db/set-view-passwords.mjs
 *
 * Monica, 2026-09-07: the codes are done with — "ab jo maine password banaya
 * tha usi se kholenge" — and only people whose data is already in the system
 * may open the tracker.
 *
 * Those two sentences are one job. Twenty-two TRACKER_VIEW accounts exist and
 * none of them holds a password: they reach the board today only because
 * board.public is still true. Shut that door first and twenty-two people are
 * locked out; hand out passwords first and the door can be shut the same
 * minute. So this script does them in that order, and refuses to offer the
 * second until the first is done.
 *
 * WHAT IS TYPED HERE IS NEVER RECORDED. The password is hashed with the scheme
 * lib/auth/password.ts verifies — scrypt, "<saltHex>:<keyHex>" — and only the
 * hash reaches the database. Unlike db/set-team-passwords.mjs this writes no
 * .sql file: one password shared by twenty-two people has no business sitting
 * in the repository in any form, even a hash. The database is the record.
 *
 * EVERY ACCOUNT GETS ITS OWN SALT, so the same password produces twenty-two
 * different hashes and the rows do not advertise that they match.
 *
 * BY DEFAULT IT ONLY FILLS THE BLANKS. Someone who has already set their own
 * password keeps it — re-running this to add a new joiner must not quietly
 * hand everyone else's account back to a password they were given once.
 */
import { randomBytes, scrypt } from "node:crypto";
import { promisify } from "node:util";
import { existsSync, readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scryptAsync = promisify(scrypt);
const HERE = dirname(fileURLToPath(import.meta.url));

function connectionString() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL.trim();
  const envFile = join(HERE, "..", "frontend", ".env.local");
  if (!existsSync(envFile)) return null;
  const m = readFileSync(envFile, "utf8").match(/^DATABASE_URL=(.+)$/m);
  return m ? m[1].trim() : null;
}

const url = connectionString();
if (!url) {
  console.log("\n  DATABASE_URL nahi mila (frontend/.env.local dekho). Kuch nahi kiya.\n");
  process.exit(1);
}

const { default: pg } = await import("pg");
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();

const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((res) => rl.question(q, res));
const bye = async (code = 0) => { rl.close(); await client.end().catch(() => {}); process.exit(code); };

const { rows: people } = await client.query(
  `SELECT u.id, lower(u.email) AS email, u.full_name,
          (u.password_hash IS NOT NULL) AS has_password
     FROM public.users u
     JOIN public.departments d ON d.id = u.department_id
    WHERE u.is_active AND d.code = 'TRACKER_VIEW'
    ORDER BY 2`,
);

console.log("");
console.log("  Dekhne wale logon ke passwords");
console.log("  ------------------------------");
if (!people.length) {
  console.log("  TRACKER_VIEW mein koi active account nahi hai. Kuch nahi kiya.\n");
  await bye(0);
}
const blank = people.filter((p) => !p.has_password);
console.log(`  ${people.length} account · ${blank.length} ke paas abhi koi password nahi.`);
console.log("");

if (!blank.length) {
  console.log("  Sab ke paas password hai. Sirf door band karna baaki ho to neeche dekho.");
}

const scope = blank.length
  ? ((await ask(`  Sirf khaali walon ko dena hai (${blank.length}), ya sabko (${people.length})? [khaali/sab] `))
      .trim().toLowerCase().startsWith("sab") ? people : blank)
  : [];

if (scope.length) {
  console.log("");
  console.log("  Password likho — kam se kam 8 characters. Screen par dikhega, isliye akele baith kar karna.");
  let password = "";
  while (true) {
    password = (await ask("    password: ")).trim();
    if (password.length < 8) { console.log("    -> kam se kam 8 characters chahiye. Dobara.\n"); continue; }
    const again = (await ask("    dobara likho: ")).trim();
    if (again !== password) { console.log("    -> dono alag hain. Dobara.\n"); continue; }
    break;
  }

  console.log("");
  for (const person of scope) {
    const salt = randomBytes(16);
    const key = await scryptAsync(password, salt, 64);
    await client.query(
      `UPDATE public.users
          SET password_hash = $2, auth_provider = 'local', updated_at = NOW()
        WHERE id = $1`,
      [person.id, `${salt.toString("hex")}:${key.toString("hex")}`],
    );
    console.log(`    set  ${person.email}`);
  }
  password = "";
}

/* Only now is the question worth asking. */
const { rows: [left] } = await client.query(
  `SELECT count(*)::int AS n
     FROM public.users u
     JOIN public.departments d ON d.id = u.department_id
    WHERE u.is_active AND d.code = 'TRACKER_VIEW' AND u.password_hash IS NULL`,
);
const { rows: [door] } = await client.query(
  `SELECT value::text AS open FROM portal.app_config WHERE key = 'board.public'`,
);

console.log("");
if (left.n > 0) {
  console.log(`  ${left.n} account abhi bhi bina password ke hain — board khula hi rehne dena padega,`);
  console.log("  warna wo log bahar ho jayenge. Unka password set karke ye script dobara chalana.");
} else if (door && door.open === "false") {
  console.log("  Board pehle se band hai — sirf sign-in karke hi khulta hai.");
} else {
  console.log("  Ab sab ke paas password hai. Board abhi bhi link se kisi ke liye bhi khulta hai.");
  const shut = (await ask("  Band kar dein, taki sirf sign-in karke khule? [haan/nahi] ")).trim().toLowerCase();
  if (shut.startsWith("h") || shut.startsWith("y")) {
    await client.query(
      `UPDATE portal.app_config SET value = 'false'::jsonb, updated_at = NOW()
        WHERE key = 'board.public'`,
    );
    console.log("  -> band. Config cache tees second mein pakad lega.");
  } else {
    console.log("  -> waise hi khula chhod diya.");
  }
}

console.log("");
console.log("  Password sirf aapko pata hai. Kahin save nahi hua.");
console.log("");
await bye(0);
