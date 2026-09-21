/**
 * Put the design team's five concept decks on a deployment.
 *
 *   BASE_URL=https://… DECK_EMAIL=… DECK_PASSWORD=… node db/set-up-design-decks.mjs
 *
 * The decks exist on a laptop because db/901 seeds them, and db/901 is a dev
 * fixture that must never touch a real database — it carries invented projects
 * and a shared password. So a deployment comes up with the design team's page
 * listing five names and no decks beside them, which is what Monica found on
 * the live site on 21 Sep.
 *
 * This makes them, through the ordinary endpoints, signed in as somebody on
 * ee.concept_deck_editors:
 *
 *   Vishakha  — her own IREO Corridors deck, from the file she made it in:
 *               fifteen spaces, twenty-six renders and the ground-floor plan.
 *   The four  — the same deck's shape and nothing of its content: the fifteen
 *               spaces still pinned to the plan, but no room names, no sizes,
 *               no costing and no renders. Those are each designer's to fill
 *               in on her own job.
 *
 * MATCHED BY NAME, NOT BY ID. "<person> — concept deck" is what /design-team
 * looks a deck up by and what decides whose deck it is, so the ids can differ
 * between deployments and nothing notices. A deck that is already there is
 * filled rather than duplicated, which makes running this twice harmless.
 *
 * The pictures are uploaded before the deck is saved, and each deck gets its
 * own copy of the plan: a picture belongs to one deck, and four decks sharing
 * one deck's plan would be three broken plans the day that deck is tidied.
 */
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline";

const SOURCE =
  process.env.IREO_DECK_FILE ??
  "C:/Users/Design1/OneDrive - ADREM (INDIA) PVT LTD/essentia decks/IREO Corridors/IREO-editor.html";
const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const EMAIL = process.env.DECK_EMAIL ?? "design.lavika@essentia.in";
const PASSWORD = process.env.DECK_PASSWORD;

const HEAD = "Vishakha";
const TEAM = ["Lavika", "Akansha Malik", "Ritu", "Jiya"];
const deckName = (person) => `${person} — concept deck`;

/**
 * Asked for rather than put in the command, because a password typed into a
 * command line is a password that ends up in the shell's history — and
 * because the placeholder in the instructions kept being run as if it were
 * the password itself, which is nobody's fault but the instructions'.
 */
function askPassword(forWhom) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(`Password for ${forWhom}: `, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

let cookie = "";
const send = (path, opts = {}) =>
  fetch(BASE + path, {
    ...opts,
    headers: { "Content-Type": "application/json", Cookie: cookie, ...(opts.headers ?? {}) },
  });

async function signIn(password) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password }),
  });
  if (!res.ok) {
    throw new Error(
      res.status === 401
        ? `That password is not ${EMAIL}'s. Try again, or set a new one with db/set-design-passwords.mjs.`
        : `Could not sign in as ${EMAIL} (${res.status}).`,
    );
  }
  cookie = (res.headers.get("set-cookie") ?? "").split(";")[0];
  if (!cookie) throw new Error("Signed in, but no session cookie came back.");
}

async function upload(deckId, dataUri, what) {
  const res = await send(`/api/decks/${deckId}/images`, {
    method: "POST",
    body: JSON.stringify({ src: dataUri }),
  });
  const out = await res.json();
  if (!res.ok || !out.url) {
    throw new Error(`${what}: ${res.status} ${JSON.stringify(out).slice(0, 120)}`);
  }
  return out.url;
}

/** The deck of this name, made if it is not there yet. */
async function deckFor(person, blankState) {
  const list = await send("/api/decks");
  if (!list.ok) throw new Error(`Could not read the decks (${list.status}).`);
  const { decks } = await list.json();
  const found = (decks ?? []).find(
    (d) => d.name.toLowerCase() === deckName(person).toLowerCase(),
  );
  if (found) return { id: found.id, made: false };

  const res = await send("/api/decks", {
    method: "POST",
    body: JSON.stringify({ name: deckName(person), projectCode: null, state: blankState }),
  });
  const out = await res.json();
  if (!res.ok || !out.deck) {
    throw new Error(`Could not make ${person}'s deck: ${res.status} ${JSON.stringify(out).slice(0, 120)}`);
  }
  return { id: out.deck.id, made: true };
}

async function save(id, state, what) {
  const got = await send(`/api/decks/${id}`);
  const { deck } = await got.json();
  const res = await send(`/api/decks/${id}`, {
    method: "PUT",
    body: JSON.stringify({ state, version: deck.version, what }),
  });
  const out = await res.json();
  if (!res.ok) throw new Error(`Save refused: ${res.status} ${JSON.stringify(out).slice(0, 140)}`);
  return out.version;
}

const run = async () => {
  const html = readFileSync(SOURCE, "utf8");
  const match = html.match(/var SAMPLE_STATE = (\{[\s\S]*?\});\s*\n/);
  if (!match) throw new Error(`No deck found inside ${SOURCE}`);
  const source = JSON.parse(match[1]);
  const clone = () => JSON.parse(JSON.stringify(source));

  const password = PASSWORD || (await askPassword(EMAIL));
  if (!password) throw new Error("No password given.");
  await signIn(password);
  console.log(`signed in as ${EMAIL} on ${BASE}`);

  /* The head's deck, whole. A deck is made empty and then filled, because the
     pictures have to be uploaded into a deck that already exists. */
  {
    const empty = clone();
    for (const s of empty.spaces ?? []) s.images = [];
    for (const p of empty.plates ?? []) p.src = "";
    const { id, made } = await deckFor(HEAD, empty);

    const state = clone();
    let sent = 0;
    for (const space of state.spaces ?? []) {
      for (const [k, im] of (space.images ?? []).entries()) {
        if (!im || typeof im.src !== "string" || !im.src.startsWith("data:image/")) continue;
        im.src = await upload(id, im.src, `${space.name} #${k + 1}`);
        sent += 1;
      }
    }
    for (const plate of state.plates ?? []) {
      if (plate && typeof plate.src === "string" && plate.src.startsWith("data:image/")) {
        plate.src = await upload(id, plate.src, "plan");
        sent += 1;
      }
    }
    const version = await save(id, state, "the IREO deck");
    console.log(`  ${HEAD.padEnd(14)} ${made ? "made" : "found"} — ${sent} pictures, version ${version}`);
  }

  /* The four: her shape, none of her content. */
  for (const person of TEAM) {
    const blank = clone();
    for (const s of blank.spaces ?? []) {
      s.images = [];
      s.name = "";
      s.dims = "";
      s.area = "";
      s.estimate = "";
      s.includes = "";
      s.summary = "";
      s.body = "";
      s.quote = "";
    }
    for (const p of blank.plates ?? []) p.src = "";
    blank.project = { ...blank.project, designer: person, rate: "", estimateBasis: "" };

    const { id, made } = await deckFor(person, blank);

    const state = JSON.parse(JSON.stringify(blank));
    for (const [i, plate] of (source.plates ?? []).entries()) {
      if (plate && typeof plate.src === "string" && plate.src.startsWith("data:image/")) {
        state.plates[i].src = await upload(id, plate.src, `${person} plan`);
      }
    }
    const version = await save(id, state, "the deck's shape, ready to fill");
    console.log(`  ${person.padEnd(14)} ${made ? "made" : "found"} — plan in, version ${version}`);
  }
};

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
