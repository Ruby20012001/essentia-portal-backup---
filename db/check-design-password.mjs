/**
 * Does this password match the one that was set?
 *
 *   node db/check-design-password.mjs
 *
 * Asks for an address and a password, and checks them against the hash in
 * db/043_design_team_accounts.sql — the same scrypt comparison the portal
 * makes. It touches no database and reaches no network.
 *
 * It answers one question and only that: is the password wrong, or is the
 * trouble somewhere else. A sign-in that fails tells you nothing about which,
 * and guessing costs an afternoon.
 *
 * What you type is not printed back and not written anywhere.
 */
import { scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { existsSync, readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scryptAsync = promisify(scrypt);
const HERE = dirname(fileURLToPath(import.meta.url));
const FILE = join(HERE, "043_design_team_accounts.sql");

if (!existsSync(FILE)) {
  console.error("\n  db/043_design_team_accounts.sql nahi mili. Pehle set-design-passwords.mjs chalao.\n");
  process.exit(1);
}

/* ('email', 'Name', 'saltHex:keyHex') — the rows the script wrote */
const hashes = new Map();
for (const m of readFileSync(FILE, "utf8").matchAll(
  /\('([^']+@[^']+)',\s*'[^']*',\s*'([0-9a-f]+:[0-9a-f]+)'\)/g,
)) {
  hashes.set(m[1].toLowerCase(), m[2]);
}

console.log("");
console.log("  Password check");
console.log("  --------------");
console.log("  Jinke liye password set hua hai:");
for (const email of hashes.keys()) console.log("    " + email);
console.log("");

const rl = createInterface({ input: process.stdin, output: process.stdout });

/* stdin ending mid-question would hang the script on a promise nobody will
   resolve — the close arrives after the question is already waiting. So the
   pending answer is resolved empty when that happens. */
let closed = false;
let pending = null;
rl.on("close", () => {
  closed = true;
  if (pending) { const done = pending; pending = null; done(""); }
});
const ask = (q) =>
  closed
    ? Promise.resolve("")
    : new Promise((res) => {
        pending = res;
        rl.question(q, (answer) => { pending = null; res(answer); });
      });

const email = (await ask("  email    : ")).trim().toLowerCase();
const stored = hashes.get(email);
if (!stored) {
  console.log("\n  Is address ke liye koi password file mein nahi hai.\n");
  rl.close();
  process.exit(1);
}
const password = (await ask("  password : ")).trim();
rl.close();

const [saltHex, keyHex] = stored.split(":");
const expected = Buffer.from(keyHex, "hex");
const actual = await scryptAsync(password, Buffer.from(saltHex, "hex"), expected.length);

if (actual.length === expected.length && timingSafeEqual(actual, expected)) {
  console.log("\n  MILTA HAI — ye password sahi hai.");
  console.log("  To sign-in ki dikkat kahin aur hai: account lock, ya us hash ka");
  console.log("  database tak na pahunchna. Ye baat aage batao.\n");
} else {
  console.log("\n  NAHI MILTA — jo password set hua tha, ye wo nahi hai.");
  console.log("  set-design-passwords.mjs dobara chalao, naya password do,");
  console.log("  aur nayi 043 file Neon mein phir se chala do.\n");
}
