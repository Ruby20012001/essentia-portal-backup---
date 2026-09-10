/**
 * A deck that exists as a file, put into the portal.
 *
 *   DATABASE_URL="postgres://…" node tools/import-deck-to-portal.mjs <deck.html|draft.json> ["Owner email"]
 *
 * The deck tool writes two things a person can hold: a built deck (one HTML
 * file, every picture inside it) and a draft (.json, the same content in the
 * shape the tool works in). Either can be handed to this script and it becomes
 * a row in ee.concept_decks, which is what /decks lists and the tool opens.
 *
 * Run it once per project. Running it again on the same project code updates
 * the deck rather than making a second one, and writes a line in the activity
 * trail saying it was imported, so the history does not begin with a mystery.
 *
 * The connection string is read from the environment and never printed.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const [input, ownerEmail] = process.argv.slice(2);
if (!input) {
  console.error('Give it a built deck (.html) or a draft (.json).');
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Take it from Vercel → Settings → Environment Variables.');
  process.exit(1);
}

/* ── the deck, whichever shape it arrived in ──────────────────────────── */
function stateFromDraft(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function stateFromDeck(file) {
  const deck = fs.readFileSync(file, 'utf8');
  const at = deck.indexOf('window.__DECK__=');
  if (at < 0) throw new Error('That HTML is not a deck this tool made.');
  const from = at + 'window.__DECK__='.length;
  const end = deck.indexOf(';<\/script>', from) >= 0
    ? deck.indexOf(';<\/script>', from)
    : deck.indexOf(';</script>', from);
  const state = JSON.parse(deck.slice(from, end).split('<\\/').join('</'));

  /* the pictures live in the markup, once each — put them back */
  const tags = [...deck.matchAll(/<img[^>]+src="(data:[^"]+)"[^>]*>/g)].map((m) => m[0]);
  const attr = (tag, name) => (tag.match(new RegExp(name + '="([^"]*)"')) || [])[1];
  const srcOf = (tag) => (tag.match(/src="(data:[^"]+)"/) || [])[1];
  const byId = {};
  (state.spaces || []).forEach((s) => { byId[String(s.id)] = s; });

  for (const tag of tags) {
    const src = srcOf(tag);
    if (!src) continue;
    if (/data-logo/.test(tag)) { state.logo = state.logo || src; continue; }
    const plate = attr(tag, 'data-plate-img');
    if (plate !== undefined) { const p = (state.plates || [])[+plate]; if (p && !p.src) p.src = src; continue; }
    const doc = attr(tag, 'data-doc');
    if (doc !== undefined) { const d = (state.documents || [])[+doc]; if (d && !d.src) d.src = src; continue; }
    const sp = attr(tag, 'data-sp');
    if (sp !== undefined) {
      const s = byId[sp], k = +attr(tag, 'data-ix');
      if (s && s.images && s.images[k] && !s.images[k].src) s.images[k].src = src;
      continue;
    }
    const spdoc = attr(tag, 'data-spdoc');
    if (spdoc !== undefined) {
      const s = byId[spdoc], k = +attr(tag, 'data-ix');
      if (s && s.docs && s.docs[k] && !s.docs[k].src) s.docs[k].src = src;
    }
  }
  return state;
}

const state = path.extname(input).toLowerCase() === '.json'
  ? stateFromDraft(input)
  : stateFromDeck(input);

const project = state.project || {};
const name = project.name || 'Untitled deck';
const code = project.code || null;
const stage = project.stage === 'execution' ? 'execution' : 'concept';
const spaces = (state.spaces || []).length;
const renders = (state.spaces || []).reduce((n, s) => n + ((s.images || []).length), 0);
const marks = (state.spaces || []).reduce(
  (n, s) => n + (s.images || []).reduce((m, im) => m + ((im.spots || []).length), 0), 0);

console.log(`${name}${code ? ' · ' + code : ''} — ${spaces} spaces · ${renders} renders · ${marks} marks`);
if (!spaces) { console.error('That deck has no spaces in it. Nothing to import.'); process.exit(1); }

/* ── into the portal ──────────────────────────────────────────────────── */
const { default: pg } = await import(
  path.join(process.cwd(), 'frontend', 'node_modules', 'pg', 'lib', 'index.js')
).catch(() => import('pg'));

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

try {
  let owner = null;
  if (ownerEmail) {
    const found = await client.query('SELECT id FROM public.users WHERE lower(email) = lower($1)', [ownerEmail]);
    if (!found.rows.length) throw new Error(`No portal account for ${ownerEmail}.`);
    owner = found.rows[0].id;
  }

  const existing = code
    ? await client.query(
        'SELECT id, version FROM ee.concept_decks WHERE project_code = $1 AND is_archived = FALSE',
        [code])
    : { rows: [] };

  let id, version, what;
  if (existing.rows.length) {
    const row = existing.rows[0];
    const updated = await client.query(
      `UPDATE ee.concept_decks
          SET state = $2::jsonb, name = $3, stage = $4, version = version + 1,
              updated_by = COALESCE($5, updated_by), updated_at = NOW()
        WHERE id = $1 RETURNING id, version`,
      [row.id, JSON.stringify(state), name, stage, owner]);
    ({ id, version } = updated.rows[0]);
    what = 'imported over the file';
  } else {
    const made = await client.query(
      `INSERT INTO ee.concept_decks (name, project_code, stage, state, created_by, updated_by)
       VALUES ($1, $2, $3, $4::jsonb, $5, $5) RETURNING id, version`,
      [name, code, stage, JSON.stringify(state), owner]);
    ({ id, version } = made.rows[0]);
    what = 'imported from the file';
  }

  await client.query(
    `INSERT INTO ee.concept_deck_activity (deck_id, user_id, what, did)
     VALUES ($1, $2, $3, $4)`,
    [id, owner, what, [
      `${spaces} spaces`, `${renders} renders`, `${marks} materials marked`,
      `from ${path.basename(input)}`,
    ]]);

  console.log(`\n${what} · version ${version}`);
  console.log(`open it at  /decks   or   /tools/concept-deck.html?deck=${id}`);
} finally {
  await client.end();
}
