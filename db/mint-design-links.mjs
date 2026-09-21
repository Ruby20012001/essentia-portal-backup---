/**
 * Give each of the design team their own tracker link.
 *
 *   node db/mint-design-links.mjs                 # print the live links
 *   node db/mint-design-links.mjs --rotate        # new links for everybody
 *   node db/mint-design-links.mjs --rotate Ritu   # a new link for one person
 *   node db/mint-design-links.mjs --rotate --html links.html   # ...and a page
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
 *
 * --html writes the same links out as one page, which is the form Monica
 * asked to keep (21 Sep: "format yahi rehna chahiye bas") — everybody on it,
 * the head on top, each name a link with her concept deck beside it. THE PAGE
 * HOLDS WORKING KEYS, so it is written where it is asked for and nowhere near
 * the repository; .gitignore carries the name as a second guard.
 */
import { randomBytes, createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import pg from "pg";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const args = process.argv.slice(2);
const rotate = args.includes("--rotate");
/* --html, optionally followed by where to write it. */
const htmlAt = args.indexOf("--html");
const htmlPath =
  htmlAt === -1
    ? null
    : args[htmlAt + 1] && !args[htmlAt + 1].startsWith("--")
      ? args[htmlAt + 1]
      : "design-links.html";
/* A name after --rotate limits it to that person; without one, everybody. */
const only = args
  .filter((a, i) => !a.startsWith("--") && i !== htmlAt + 1)
  .map((a) => a.toLowerCase());

const client = new pg.Client({ connectionString: DATABASE_URL });

function mint() {
  const secret = randomBytes(32).toString("hex");
  return { secret, hash: createHash("sha256").update(secret).digest("hex") };
}

const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );

/** The page Monica keeps — everybody on it, the head on top. */
function pageFor(rows) {
  const card = (r) => {
    const head = r.role === "head";
    const links = [
      r.link
        ? `<a class="go" href="${esc(r.link)}"><b>${head ? "Dashboard kholo" : "Tracker"}</b>${
            head ? " — menu me chaaro ke naam bhi milenge" : ""
          }</a>`
        : `<span class="none">${esc(r.why ?? "koi link nahi")}</span>`,
      r.deck ? `<a class="go" href="${esc(r.deck)}"><b>Concept deck</b></a>` : "",
    ]
      .filter(Boolean)
      .join("\n      ");
    return `  <div class="card${head ? " head" : ""}">
    <div class="row"><span class="name">${esc(r.name)}</span><span class="role">${
      head ? "poora board · sirf dekhne ke liye" : "apna tracker · edit kar sakti hai"
    }</span></div>
    <div class="links">
      ${links}
    </div>
  </div>`;
  };

  const when = new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Design Team Links</title>
<style>
  :root {
    --bg: #f6f5f3; --card: #ffffff; --ink: #1c1b19; --muted: #6b6862;
    --line: #e2dfd9; --accent: #8a6a3d; --accent-soft: #f3ece0;
    --warn-bg: #fdf6e7; --warn-line: #e8d4a8;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --bg: #171614; --card: #201f1c; --ink: #f2efea; --muted: #9b968d;
      --line: #322f2a; --accent: #c9a26a; --accent-soft: #2a241a;
      --warn-bg: #241f14; --warn-line: #4a3c22;
    }
  }
  :root[data-theme="dark"] {
    --bg: #171614; --card: #201f1c; --ink: #f2efea; --muted: #9b968d;
    --line: #322f2a; --accent: #c9a26a; --accent-soft: #2a241a;
    --warn-bg: #241f14; --warn-line: #4a3c22;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--bg); color: var(--ink);
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    line-height: 1.55; padding: 40px 16px 64px;
  }
  .wrap { max-width: 720px; margin: 0 auto; }
  h1 { font-size: 26px; font-weight: 600; margin: 0 0 4px; letter-spacing: -0.01em; }
  .sub { color: var(--muted); font-size: 14px; margin: 0 0 28px; }
  h2 {
    font-size: 11px; text-transform: uppercase; letter-spacing: 0.14em;
    color: var(--muted); font-weight: 700; margin: 34px 0 12px;
  }
  .card {
    background: var(--card); border: 1px solid var(--line); border-radius: 10px;
    padding: 16px 18px; margin-bottom: 10px;
  }
  .card.head { border-color: var(--accent); background: var(--accent-soft); }
  .row { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
  .name { font-size: 17px; font-weight: 600; }
  .role { font-size: 12px; color: var(--muted); }
  .links { margin-top: 10px; display: flex; flex-direction: column; gap: 7px; }
  a.go {
    display: inline-block; font-size: 13px; text-decoration: none;
    color: var(--accent); border: 1px solid var(--line); border-radius: 6px;
    padding: 7px 11px; background: var(--bg); word-break: break-all;
  }
  a.go:hover { border-color: var(--accent); }
  a.go b { color: var(--ink); font-weight: 600; }
  .none { font-size: 13px; color: var(--muted); }
  .note {
    background: var(--warn-bg); border: 1px solid var(--warn-line);
    border-radius: 10px; padding: 14px 16px; font-size: 13px;
    color: var(--ink); margin-top: 30px;
  }
  .note p { margin: 0 0 8px; }
  .note p:last-child { margin: 0; }
  .note strong { font-weight: 600; }
  footer { color: var(--muted); font-size: 12px; margin-top: 26px; }
</style>
</head>
<body>
<div class="wrap">

  <h1>Design team — saare link</h1>
  <p class="sub">Ek page par sab kuch. Naam par click karo, seedha khul jaata hai — koi password nahi.</p>

  <h2>Tracker</h2>

${rows.map(card).join("\n\n")}

  <div class="note">
    <p><strong>Link hi chaabi hai.</strong> Jiske paas kisi designer ka link pahunch gaya, wo uske naam par tick kar sakta hai. Isliye yeh page sambhal kar rakhiye — har designer ko sirf uska apna link dijiye.</p>
    <p><strong>Ek browser me ek waqt par ek hi.</strong> Doosra kholna ho toh incognito window me kholiye.</p>
    <p><strong>Link dobara nahi dikhega.</strong> Database me sirf uska hash jaata hai. Naya chahiye toh <code>--rotate</code> chalaiye — purana usi waqt band ho jaata hai.</p>
  </div>

  <footer>Design Activity Tracker · essentia · ${esc(when)}</footer>

</div>
</body>
</html>
`;
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

  /* Her concept deck sits beside her tracker on the page — the two things a
     designer opens, in one row, rather than in two different messages. */
  if (htmlPath) {
    const { rows: decks } = await client.query(
      `SELECT id, name FROM ee.concept_decks WHERE NOT is_archived`,
    );
    for (const row of out) {
      const deck = decks.find(
        (d) => d.name.toLowerCase() === `${row.name.toLowerCase()} — concept deck`,
      );
      if (deck) row.deck = `${BASE}/deck/${deck.id}`;
    }
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

  if (htmlPath) {
    writeFileSync(htmlPath, pageFor(out), "utf8");
    console.log(`\nPage written: ${htmlPath}`);
    console.log(`It holds working links — keep it off shared drives and out of git.`);
  }

  await client.end();
};

run().catch(async (error) => {
  console.error(error.message);
  await client.end().catch(() => {});
  process.exit(1);
});
