# essentia portal + concept deck — handover

**Monica ke liye, do line mein:** yeh file batati hai kaam kahan tak pahuncha,
aage kya karna hai aur kaise check karna hai. Doosre system par sirf repo clone
karo aur neeche likhe steps follow karo. Claude ke notes (`memory/`) aur deck
tool ki stamped file handover zip mein hain — OneDrive → `essentia decksessentia-deck-handover-18Sep.zip`.

Written 18 Sep 2026, from the session that built the materials list, the 360
views and the load-speed work.

---

## 1. Where everything is

| Thing | Where |
|---|---|
| Code | GitHub `Ruby20012001/essentia-portal-backup---`, branch **`main`** (public repo) |
| Last commit in this work | `056706b` — perf(deck): the deck opens faster |
| Live site | https://essentia-portal-backup-w6xi.vercel.app (Vercel project `essentia-portal-backup-w6xi`, team `hobby-c495`, production branch `main`, Root Directory `frontend`) |
| Database | Neon, **Singapore** project `icy-voice-94268781`, db `neondb`, branch `production` |
| IREO deck | `/deck/d7114344-cacf-4396-9c79-412411268fa2` |
| The deck tool (one file) | `tools/concept-deck-configurator.html`, copied to `frontend/public/tools/concept-deck.html` |
| Monica's daily copy | OneDrive → `essentia decks\concept-deck-configurator.html` (SharePoint-synced) |

The repo is **public**. Never push connection strings, keys or password hashes;
scan the diff before every push.

## 2. Starting on another machine

```bash
git clone https://github.com/Ruby20012001/essentia-portal-backup---.git essentia-portal
cd essentia-portal/frontend
npm install
cp .env.example .env.local     # then fill in, see below
npm run dev                    # http://localhost:3000
```

`.env.local` needs at least:

- `DATABASE_URL` — the Neon connection string. Get it from the Neon dashboard
  (project → Connection Details) or from Vercel → Project → Settings →
  Environment Variables. **It is a secret; it is not in this package.**
- `NEXT_PUBLIC_PORTAL_MODE=tracker` — the live site runs in tracker mode, which
  means `TRACKER_MODE_PREFIXES` in `frontend/lib/portal-mode.ts` is the whole
  list of routes that are served. A new route must be added there or it 404s.
- `AUTH_ALLOW_DEV_LOGIN` stays unset for anything production-like.

Checks that run without a database:

```bash
cd frontend
node node_modules/typescript/bin/tsc -p . --noEmit      # types
node node_modules/vitest/vitest.mjs run                 # 306 unit tests
node node_modules/next/dist/bin/next lint --file <path> # lint one file
cd ..
node tools/sync-portal-copy.mjs --check                 # tool == portal copy
```

**In a git worktree there is no `node_modules`** — link the main checkout's with
a junction (see `memory/worktree-tooling.md`).

## 3. What was built in this stretch (all live)

1. **Materials list** (`9422c9f`) — deck chapter 06: material name, code,
   material, sample, size, brand. Read off the marks on the renders; the sample
   swatch is cut from the render. Editor has a "Materials" card for corrections,
   real sample photos and hand-added materials (`state.materials`).
2. **Pictures go up on their own** (`e66540c`) — `POST /api/decks/<id>/images`,
   slot = `pic:<sha-256 first 32 hex>`; the tool uploads new pictures before
   saving, so a deck stays a few tens of KB. Saves refuse a state over 3.5 MB.
3. **Phone width + material cards** (`5377727`) — the reading pane was
   fit-content and one table made the page 554px on a 390px phone.
4. **360 views** (`2b9bc55`) — `space.panos[]`, equirectangular 2:1 only, kept
   4096×2048, drawn by an inline WebGL shader (no library, works from disk).
   Button on the room's picture; drag, pinch, arrows, Escape.
5. **Load speed** (`056706b`) — functions moved to Singapore
   (`frontend/vercel.json` → `regions: ["sin1"]`), public deck queries in
   parallel, the logo no longer saved inside the deck, printed-page pictures
   deferred to `data-print-src` + `printReady()`, editor card images lazy,
   swatches cut only near the screen, uploads three at a time.
   Measured on IREO, cold cache: deck data 6.0s → 0.9s, everything visible
   9.4s → 2.0s, pictures on open 27 (4.1 MB) → 13 (2.1 MB).

## 4. What is NOT done — pick up here

### 4.1 Automatic room numbers from a plan (Monica's live request)

She wants: **upload any plan → rooms and numbers appear by themselves**, with no
lookbook and no hand-pinning. Today a room is added by hand
(`+ Add space` → name → `Place pin` → click on the plan).

Decided constraints:

- **No AI.** `db/036_remove_ai_advisory.sql` took the AI layer out deliberately
  (Ruby, 2 Sep 2026) — do not bring an API key back without asking.
- So it must run in the browser:
  - **DXF plans:** the tool's DXF reader already parses `TEXT`/`MTEXT` with
    positions (`dxfFlatten` emits `['t', x, y, size, text]`). Room names and
    their coordinates are there for free — convert with the same transform
    `dxfPng` uses for the image, and place pins.
  - **JPG/PNG/PDF plans:** no text layer, so OCR. tesseract.js 5.1.1 from
    jsdelivr works on the portal page (verified): worker + core wasm (~3.9 MB) +
    `@tesseract.js-data/eng@1.0.0/4.0.0_best_int` (~2.9 MB) load fine, first use
    only, then cached.

Experiment state (`tools/checks/ocr-try.mjs`): the worker is created and the language
data loads (`ocr-probe2.mjs` passes), but the full run — draw plan to a 2× canvas,
`worker.setParameters({ tessedit_pageseg_mode: '11' })`, `worker.recognize(canvas)`
— rejected with a bare `Event`. Next step: run each call separately with the
logger on, and try `recognize(imageUrl)` and PSM 11 vs 6, before writing any
feature code. The IREO plan is only 1190×845, so upscale 2–3× before OCR.

Sketch of the feature once OCR gives words + boxes:

1. Normalise words, group words on a line and stacked lines into labels.
2. Match against the room vocabulary (`TYPES` in the tool + synonyms: bedroom,
   bath, toilet, powder, kitchen, utility, store, dining, living, foyer,
   balcony, dressing, pooja, study…). Throw away dimensions and notes.
3. Pin = centre of the label box, as a fraction of the plan.
4. Order: start at the entrance/foyer, then nearest-neighbour, so numbers walk
   through the house the way IREO's do.
5. Show what was found with checkboxes before adding, then create the spaces.

### 4.2 Smaller things left

- **A deck exported from the portal keeps portal picture links**, so a file
  opened from disk probably shows no pictures. There is a spawned task for it
  (`Inline portal pictures when exporting a deck file`) with the full brief.
- **IREO has no 360 renders.** Checked `Z:\` — only normal renders. The 3D team
  must export "360 panorama / spherical" (2:1) for the button to appear.
- **Rotate the Neon password.** The connection string was pasted in chat twice
  and used. Neon → Roles → `neondb_owner` → Reset password, then update
  `DATABASE_URL` in Vercel and redeploy.
- **Dimensions from the plan** would be the natural follow-on to 4.1: the
  label usually has `3900 [12'-10"]` under it.

## 5. How this work is checked (no live writes)

Everything in `tools/checks/` drives a headless Chrome over CDP. Start Chrome once:

```bash
"C:\Program Files\Google\Chrome\Application\chrome.exe" --headless=new \
  --remote-debugging-port=9333 --user-data-dir=<a scratch folder> about:blank
```

Two local servers stand in for the portal (both read the worktree's tool file,
so the code under test is the file you are editing):

```bash
node tools/checks/deck-proxy.cjs tools/concept-deck-configurator.html 4188        # read-only: GETs go to the live site
node tools/checks/deck-proxy-mock.cjs tools/concept-deck-configurator.html 4189   # editor: writes kept in memory, never live
```

Then, for example:

```bash
node tools/checks/load-profile.mjs https://essentia-portal-backup-w6xi.vercel.app/deck/<id> 1280 900 30
node tools/checks/lazy-check.mjs   http://127.0.0.1:4188/deck/<id> out.png
node tools/checks/print-check.mjs  http://127.0.0.1:4188/deck/<id>
node tools/checks/editor-sitting.mjs http://127.0.0.1:4189 <out dir>
node tools/checks/pano-sitting.mjs <out dir>          # draws its own test panorama
node tools/checks/stamped-check.mjs <tool.html> <pano.jpg> <shot.png>
```

`deck-proxy-mock.cjs` answers `canEdit: true` (or `canEdit: false` with a
`reader=1` cookie), keeps every PUT and picture POST in memory, and lists them
at `GET /__writes`. The live IREO deck is never written to.

## 6. Gotchas that cost time here

- **Vercel does not always deploy on a push.** Check Deployments; promote the
  newest build if production is stale. Hobby allows 100 deployments a day, and
  pushes made while the cap is spent are lost, not queued.
- **A hidden `<img src>` is still fetched.** That was 14 of the 27 pictures on
  opening IREO.
- **A grid item centred with `margin: 0 auto` sizes to its content**, so one
  wide table widened the whole page on a phone.
- **`git bash` heredocs and `node -e` here eat backslashes** — write patch
  scripts with a file, not inline.
- **Every new table needs its own GRANT** (`db/044`), and `neondb_owner` needed
  `GRANT essentia_app TO neondb_owner;` for `withUserContext` to work.
- The rest is in `memory/` — read `MEMORY.md` first.

## 7. The memory folder

The handover zip (OneDrive → `essentia decks`) carries `memory/`: the notes a
Claude Code session keeps for this project. They are deliberately not in this
public repo. On the new machine, put it at:

```
~/.claude/projects/<the project's folder key>/memory/
```

The folder key is the project path with separators replaced by `-`, e.g.
`C--Users-Ai-01-Desktop-ruby-crm-essentia-portal`. Easiest: start Claude Code in
the project once (it creates the folder), then copy these files in. Or just tell
the new session: "read HANDOVER.md and the memory folder in this package".

## 8. Also in the handover zip

- `tool/concept-deck-configurator-17Sep-1706.html` — the stamped build of the
  deck tool as delivered (materials list + 360; header shows `build 17Sep-1706`).
- `tool/test-360-room.jpg` — a drawn 360 panorama for testing the 360 view. Not
  a real render; do not put it in a client deck.
