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
3. **Signed drawings** — the SLD, the GFC, the layouts, as they come off the
   board. Drop or paste the JPGs, then name each one and date it. They get their
   own chapter in the deck, full width, in the order you set. Optional.

   They are deliberately **not** filed behind a room. A signed drawing is not
   for the client who cannot read a drawing — it is the record of what was
   agreed — so it stands on its own rather than sitting among the renders.
   Held at 2400px, because a drawing is read rather than admired.
4. **Detailed estimate** — the sheet the number was built from, page by page,
   so a client can read it rather than take it on trust. Same shape as the
   drawings: drop the JPGs, name and date each page. It becomes its own chapter,
   and the arithmetic behind the estimate chip links straight to it.

   A page of a BOQ is unreadable at page width on a phone, so **tapping any
   drawing or estimate page opens it full screen at its own size**, to be panned
   and pinched rather than squinted at. Held at 2600px for the same reason.
5. **Spaces** — add each space, pick the name from the list for the project type
   so naming does not drift, **choose its floor** from the plates you added, set
   the **dimensions, area and estimate**, then **Place pin** and click the plan.
   The floor is a choice, not a typed line — it decides which drawing the pin
   goes on, and renaming a plate renames the floor on every space that sits on
   it. Moving a space to another floor clears its pin, because the old one was
   on a different drawing. A row left blank does not appear to the
   client, so a deck that should carry no money simply carries none.

   **State what the estimate is.** `Estimate basis` on the cover prints under
   the figures on screen, on paper and inside the shared image. A number with
   no basis stated will be read as a quotation sooner or later.

   **The estimate is usually one number, not fifteen.** Put a rate in
   `Estimate rate (₹ / sq.ft.)` on the cover and every space that has an area
   prices itself — the same arithmetic the fee proposal already does per
   sq.ft. An estimate typed against a single space overrides the rate for that
   space. The running total sits on the Spaces card as you work.
6. **Visuals** — drop, pick, or paste the renders onto each space. The first is
   the hero; the rest become the thumbnail strip. `↑` on any thumbnail promotes
   it to hero.
   Each space carries four pieces of writing: the **one line** (what it is),
   the **paragraph** (why it sits there), and a **quotable** — one sentence,
   pulled out under an amber rule, meant to be the thing the client repeats to
   someone else. Write the quotable to the type of space, not to the project.

7. **Narrative** — the note the client reads before the spaces, and the
   representational-purpose disclaimer.
8. **Publish gates** — all nine must pass before `EXPORT DECK` unlocks.

`SAVE DRAFT` writes a `.json` holding everything including the images — that is
the real save. The tool also keeps the *text* of your last session in the
browser so a crash does not lose the writing, but images are not kept there;
re-attach them or reopen the draft.

### What is on the page, and what is behind a number

Under the grid of spaces sit two buttons that need no tapping to find:
**Save all spaces as images** and **Save the whole deck as PDF**. Everything
else is behind a number.

The deck footer carries a **Deck built** date and time. If a deck is not
behaving as described here, read that line first — it says which copy is open,
which matters once a few versions have been saved to the same downloads folder.

### What a client gets when they open a space

The number on the drawing opens a panel that scrolls: the render, the other
angles as thumbnails, the name, then **size · area · estimate**, then the line,
the paragraph and the quotable. **Size, area and estimate are chips**, the same
weight as the buttons beneath them, so the figures are as easy to find as the
actions. Size and area are facts and do nothing when pressed. The estimate
opens: tapping it shows the arithmetic behind the number — 142 sq ft x 1,200
per sq ft = 1,70,400 — which is simply printed on paper and inside the shared
image, where there is nothing to tap. Under them sits the estimate basis, and
anything entered under **What it includes**. Then five buttons — share,
save as image, save as PDF, see it on the plan, and the whole deck.

**Share this space** is the one for a phone: it draws the JPG and hands it to
the share sheet, so it goes to WhatsApp without ever becoming a file anyone has
to find. Where sharing a file is not offered, it saves the image instead.
**See it on the plan** closes the panel and puts the client back on the drawing
with that number held in amber for a moment.

**Save as image** draws that space onto a single 1080px JPG — the essentia
mark, the project and date, the render, the number, the name, the size, the
area, the estimate, the writing, the quotable, the concept stamp and the
disclaimer, all inside the picture. It is the one that matters for WhatsApp: a
PDF has to be opened, an image shows itself in the message. Drawn on a canvas
in about a fifth of a second, roughly 200 KB, and it needs no library and no
network. **All as images** in the tool header does the whole deck, one file per
space, saved one at a time so the browser does not refuse the burst.

Under the buttons, **Play** and **Reverse** walk the deck on their own — one
space every 10 seconds, forward or backward, so nobody taps Next fifteen times.
An amber bar shows the time left, so a room is never pulled away unannounced.
It never starts by itself, it stops at either end rather than looping, and any
tap on Previous, Next or an arrow key hands control straight back. The pace is
`Move on after (seconds)` on the cover.

**Save as PDF** prints that one space on its own — essentia mark,
project and date across the top, the space with its numbers and its renders,
the disclaimer at the foot. Everything else in the deck is put away. It goes
through the browser's own printer, which is where "Save as PDF" lives on a
laptop and on a phone alike, so there is no library and nothing to install.
**Whole deck** does the same for all of it, one space per sheet.

So a client who is sent the deck, opens one room and saves it, has that room's
size, area, estimate, drawings and words in a single file — as a picture they
can forward, or a PDF they can file — without anyone at essentia assembling it.

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
