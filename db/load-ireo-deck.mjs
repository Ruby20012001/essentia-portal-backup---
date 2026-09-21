/**
 * Put Monica's own IREO Corridors deck back, pictures and all.
 *
 *   node db/load-ireo-deck.mjs
 *
 * The deck on the board is hers, made in the tool on 10 Sep and living as a
 * self-contained HTML file in her OneDrive. This reads that file and loads it
 * into the portal: fifteen spaces, twenty-six renders and the ground-floor
 * plan.
 *
 * WHY THIS EXISTS. The pictures are rows in ee.concept_deck_images, not
 * anything in the repository, so a database built from scratch comes up with
 * the deck's cards empty. That happened three times in one afternoon and each
 * time it looked like the uploads had been lost. It is one command now.
 *
 * The file holds its pictures as data URIs. They cannot be written into the
 * deck that way — the portal keeps pictures as rows and the state as text —
 * so each is uploaded first and the space is pointed at the url that comes
 * back. Re-running it is safe: the pictures land in the same slots, because a
 * slot is named from what the picture contains.
 *
 * Needs a signed-in session, since every write goes through the ordinary
 * endpoints. SOURCE and DECK can be overridden by environment variables.
 */
import { readFileSync } from "node:fs";

const SOURCE =
  process.env.IREO_DECK_FILE ??
  "C:/Users/Design1/OneDrive - ADREM (INDIA) PVT LTD/essentia decks/IREO Corridors/IREO-editor.html";
const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const DECK = process.env.DECK_ID ?? "d1000000-0000-4000-8000-000000000005";
const EMAIL = process.env.DECK_EMAIL ?? "design.vishakha@essentia.in";
const PASSWORD = process.env.DECK_PASSWORD ?? "test1234";

let cookie = "";
const send = (path, opts = {}) =>
  fetch(BASE + path, {
    ...opts,
    headers: { "Content-Type": "application/json", Cookie: cookie, ...(opts.headers ?? {}) },
  });

async function signIn() {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`Could not sign in as ${EMAIL} (${res.status}).`);
  cookie = (res.headers.get("set-cookie") ?? "").split(";")[0];
  if (!cookie) throw new Error("Signed in, but no session cookie came back.");
}

async function upload(dataUri, what) {
  const res = await send(`/api/decks/${DECK}/images`, {
    method: "POST",
    body: JSON.stringify({ src: dataUri }),
  });
  const out = await res.json();
  if (!res.ok || !out.url) {
    throw new Error(`${what}: ${res.status} ${JSON.stringify(out).slice(0, 120)}`);
  }
  return out.url;
}

const run = async () => {
  const html = readFileSync(SOURCE, "utf8");
  const match = html.match(/var SAMPLE_STATE = (\{[\s\S]*?\});\s*\n/);
  if (!match) throw new Error(`No deck found inside ${SOURCE}`);
  const state = JSON.parse(match[1]);

  await signIn();

  let sent = 0;
  for (const space of state.spaces ?? []) {
    for (const [k, im] of (space.images ?? []).entries()) {
      if (!im || typeof im.src !== "string" || !im.src.startsWith("data:image/")) continue;
      im.src = await upload(im.src, `${space.name} #${k + 1}`);
      sent += 1;
    }
  }
  for (const plate of state.plates ?? []) {
    if (plate && typeof plate.src === "string" && plate.src.startsWith("data:image/")) {
      plate.src = await upload(plate.src, `plan ${plate.label ?? ""}`);
      sent += 1;
    }
  }

  const got = await send(`/api/decks/${DECK}`);
  if (!got.ok) throw new Error(`No deck ${DECK} to write into (${got.status}).`);
  const { deck } = await got.json();

  const saved = await send(`/api/decks/${DECK}`, {
    method: "PUT",
    body: JSON.stringify({ state, version: deck.version, what: "loaded the IREO deck" }),
  });
  const result = await saved.json();
  if (!saved.ok) throw new Error(`Save refused: ${JSON.stringify(result).slice(0, 140)}`);

  console.log(
    `${state.spaces.length} spaces, ${sent} pictures — saved as version ${result.version}.`,
  );
};

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
