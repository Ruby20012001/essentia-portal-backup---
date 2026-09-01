# Standalone tools

Single-file browser tools for the team. No install, no build, no server
required — open the `.html` file and work. They are deliberately independent of
the portal so a Client Advisor can use one today, from the share, on any laptop.

| Tool | What it is for |
|---|---|
| [concept-deck-configurator.html](concept-deck-configurator.html) | Turns a layout plus space-wise 3D visuals into a deck a client can read without knowing how to read a drawing. |

---

## Concept Deck Configurator

Same working shape as the Fee Configurator: **dark editor on the left, the live
client document on the right**, with `PREVIEW · SAVE DRAFT · PRINT / PDF ·
EXPORT DECK` in the header.

### What it produces

One self-contained `.html` file. The plan is the interface: every space carries
a number on the drawing, and tapping a number opens that space — its floor, its
size, one line saying what it is, and a paragraph on why it sits there. There is
a card grid underneath for a client who would rather scroll than tap, and the
whole thing folds back into a flat printable lookbook via `PRINT / PDF`.

The exported file has every image inlined. It works offline, on a phone, with
nothing installed and no login — you can mail it, put it on the share, or host
it. Nothing is ever uploaded anywhere by the tool itself; images are downscaled
inside the browser (visuals to 1500px, plans to 2400px).

**The deck is written out as a finished document, not as a script that draws
one.** Every space — its dimensions, its line, its paragraph, its quotable and
all its images — is in the file as plain markup. With JavaScript blocked,
disabled, or simply never run (an email attachment viewer, a file manager, a
phone that gives up on a large page) the whole deck still reads top to bottom,
as a lookbook. The script only adds the tapping: it hides the long-form
sections, inserts the card grid, and opens the panels. Each picture is stored
exactly once — the interactive layer harvests the images back out of the markup
rather than shipping a second copy.

### Working sequence

1. **Client & cover** — project name, project code (`ED/YY-YY/NNN`), Client
   Advisor, headline.
2. **Layout plates** — one per floor. Click the plate, then **paste a snip of
   the plan**: `Win+Shift+S`, drag over the drawing in whatever is showing it,
   then `Ctrl+V` on the plate. Dropping or picking a PNG/JPG works too.
   *(A plan inside an InDesign PDF is vector — there is no image file to drag
   out of it, which is why paste is the shortest route.)*
3. **Spaces** — add each space, pick the name from the list for the project type
   so naming does not drift, set the floor and dimensions, then **Place pin** and
   click the plan.
4. **Visuals** — drop, pick, or paste the renders onto each space. The first is
   the hero; the rest become the thumbnail strip. `↑` on any thumbnail promotes
   it to hero.
   Each space carries four pieces of writing: the **one line** (what it is),
   the **paragraph** (why it sits there), and a **quotable** — one sentence,
   pulled out under an amber rule, meant to be the thing the client repeats to
   someone else. Write the quotable to the type of space, not to the project.
5. **Narrative** — the note the client reads before the spaces, and the
   representational-purpose disclaimer.
6. **Publish gates** — all nine must pass before `EXPORT DECK` unlocks.

`SAVE DRAFT` writes a `.json` holding everything including the images — that is
the real save. The tool also keeps the *text* of your last session in the
browser so a crash does not lose the writing, but images are not kept there;
re-attach them or reopen the draft.

### The gates, and what they refuse

Export stays disabled, and the reason is stated in full, until:

| Gate | Refusal |
|---|---|
| Project name | `Project name missing. The deck cannot publish without it.` |
| Project code | `Project code missing or malformed. Use ED/YY-YY/NNN — for example ED/26-27/058.` |
| Cover headline | `Cover headline missing. The client sees this first.` |
| Layout attached | `Layout not attached. The plan is the interface; the deck cannot publish without it.` |
| At least one space | `No spaces added. Mark at least one space on the layout.` |
| Every space pinned | `N space(s) not pinned to the layout: … Every marked space must sit on the plan.` |
| Every space has a visual | `N space(s) have no visual: … A marked space with no picture cannot be sent to a client.` |
| Every space has its line | `N space(s) have no description line: … Every marked space opens — its size, and what it is for.` |
| Vocabulary | `Vocabulary check failed. <term> (<where>) …` |

The empty-visual gate is the one that matters most in practice: a marked space
with no picture is the commonest defect in a lookbook, and it is invisible until
a client finds it.

### Vocabulary

Client-facing copy is checked live against the house list in `CLAUDE.md`, per
field and again at the gate. Banned with no replacement: **luxury · curated ·
seamless · holistic · world-class · best-in-class**. Replaced: **bespoke** →
custom / made-to-order · **studio** → firm · **showroom** → Experience Centre ·
**factory** → production facility · **complaint** → concern / feedback ·
**deliverable** → milestone · **handover** → Day of Recognition ·
**handover certificate** → Completion Certificate. `Essentia` with a capital E
is flagged — the name is always lowercase.

### Standing rule

Every deck carries **Concept · not for construction**. It is a concept-stage
instrument: it sits at CP/SLD on the Drawing Ladder, it never replaces a GFC
set, and it is never an input to a PIO. The Triangle of Agreement is untouched
by it.

### Sample

[samples/ireo-corridors-concept-deck.html](samples/ireo-corridors-concept-deck.html)
— built from the 23 renders in the signed IREO Corridors lookbook of
05.08.2026, on the ground floor sheet, with the fifteen space names exactly as
marked on that drawing.

The ground floor sheet is attached and **all fifteen spaces are pinned on it**.
Each carries its dimensions, a one-line summary, a paragraph and a quotable —
every dimension, level change and fitting read straight off the drawing.

Two visuals were not in the lookbook: `utility` and `store room` come from
images Monica supplied on 01.09.2026. The second `balcony` reuses the balcony
render that already exists.

All fifteen carry a visual and **every gate passes**. The home office renders
were in the lookbook all along, sitting under the master bath heading because
those pages carry no heading of their own — an offset lookup files them with
the section above. The plan marks fifteen spaces; the lookbook read as eleven.

The written copy was **signed off by Monica Chawla, principal designer, on
2026-09-01**. Every dimension, level change and fitting in it is read off the
ground floor sheet.

### Running it

Open the file directly, or serve the folder:

```bash
node tools/preview-server.mjs 4177
```

### Later, in the portal

The engine here is the portal module in miniature. When it moves in, it becomes
a screen under the Design Room at CP/SLD with the deck stored per project,
RLS-scoped and audited; the space visuals matched automatically out of
essentia's finished-project archive through pgvector rather than uploaded by
hand; and — the part a file cannot do — **read tracking**, so the Client Advisor
sees which spaces the client opened, in what order, and how often. A client who
opens the master bedroom six times and never opens the kitchen has said
something worth hearing before they have written a word.
