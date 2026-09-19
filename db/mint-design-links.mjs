/**
 * Give each of the design team their own tracker link.
 *
 *   node db/mint-design-links.mjs                 # print the live links
 *   node db/mint-design-links.mjs --rotate        # new links for everybody
 *   node db/mint-design-links.mjs --rotate Ritu   # a new link for one person
 *
 * Monica, 19 Sep 2026: the four do not sign in to anything else, so each of
 * them gets a link the way each concept deck is a link. This mints them.
 *
 * The secret is printed ONCE, here, and never again: only its SHA-256 goes
 * into ee.design_tracker_links (db/053), the same treatment a session token
 * gets. Lose the link and you rotate it rather than recover it.
 *
 * Rotating revokes the person's current row and issues a new one, so a link
 * that has gone astray stops working the moment this is run. The account is
 * not touched — whoever holds the old link is simply no longer anybody.
 *
 * BASE_URL sets what is printed in front of the path; it changes nothing in
 * the database, so printing a local link and a live one are the same run.
 */
import { randomBytes, createHash } from "node:crypto";
import pg from "pg";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const args = process.argv.slice(2);
const rotate = args.includes("--rotate");
/* A name after --rotate limits it to that person; without one, everybody. */
const only = args.filter((a) => !a.startsWith("--")).map((a) => a.toLowerCase());

const client = new pg.Client({ connectionString: DATABASE_URL });

function mint() {
  const secret = randomBytes(32).toString("hex");
  return { secret, hash: createHash("sha256").update(secret).digest("hex") };
}

const run = async () => {
  await client.connect();

  const { rows: people } = await client.query(
    `SELECT p.id, p.name, p.role, p.user_id
       FROM ee.design_tracker_people p
      WHERE p.is_active
      ORDER BY p.sort_order`,
  );

  const chosen = people.filter((p) => only.length === 0 || only.includes(p.name.toLowerCase()));
  if (chosen.length === 0) {
    console.error(`Nobody matched. The team is: ${people.map((p) => p.name).join(", ")}`);
    process.exit(1);
  }

  const out = [];
  for (const person of chosen) {
    /* Somebody on the board with no portal account cannot be signed in as,
       so minting them a link would print something that 409s when opened. */
    if (!person.user_id) {
      out.push({ name: person.name, role: person.role, link: null, why: "no portal account" });
      continue;
    }

    const { rows: live } = await client.query(
      `SELECT id FROM ee.design_tracker_links
        WHERE person_id = $1 AND revoked_at IS NULL`,
      [person.id],
    );

    if (live.length > 0 && !rotate) {
      out.push({
        name: person.name,
        role: person.role,
        link: null,
        why: "already has a link — rotate to replace it",
      });
      continue;
    }

    if (live.length > 0) {
      await client.query(
        `UPDATE ee.design_tracker_links SET revoked_at = NOW() WHERE id = ANY($1::uuid[])`,
        [live.map((r) => r.id)],
      );
    }

    const { secret, hash } = mint();
    await client.query(
      `INSERT INTO ee.design_tracker_links (person_id, token_hash) VALUES ($1, $2)`,
      [person.id, hash],
    );
    out.push({ name: person.name, role: person.role, link: `${BASE}/my-tracker/${secret}` });
  }

  const width = Math.max(...out.map((o) => o.name.length));
  for (const o of out) {
    const what = o.role === "head" ? "reads the board" : "her own tracker";
    console.log(
      `${o.name.padEnd(width)}  ${what.padEnd(16)}  ${o.link ?? `— ${o.why}`}`,
    );
  }
  if (!rotate && out.some((o) => o.why?.startsWith("already"))) {
    console.log(`\nA link is shown once, when it is made. Re-run with --rotate to issue new ones.`);
  }

  await client.end();
};

run().catch(async (error) => {
  console.error(error.message);
  await client.end().catch(() => {});
  process.exit(1);
});
