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

The header carries a **build stamp** and a row of jump links — Documents, Cover,
Plates, Spaces, Narrative, Gates. The stamp says which copy of the tool is open,
which settles the commonest confusion once a few versions have been downloaded;
the links land on any card without scrolling past the Spaces list, which runs
thousands of pixels long on a real project.

The tool **opens on a working deck** — the IREO ground floor sheet with its
fifteen spaces pinned, their dimensions and their writing — so the thing
explains itself before anyone has attached a file. `NEW BLANK` clears it.

Delivery copies are cut with
`node tools/stamp-build.mjs tools/concept-deck-configurator.html <outDir>`,
which writes the build time into the file and the filename together.

### Working sequence

1. **Upload documents** — one drop zone, the first card. Signed drawings, the
   detailed estimate, anything else the client should be able to read. Name and
   date each page. They become one chapter in the deck, full width, in the order
   you set, and tapping a page opens it full screen to be read. Held at 2600px,
   because these are read rather than admired. Optional.
2. **Client & cover** — project name, project code (`ED/YY-YY/NNN`), Client
   Advisor, headline.
3. **Layout plates** — one per floor. Drop or pick a **PNG, JPG or PDF**, or
   **paste a snip**: `Win+Shift+S`, drag over the drawing in whatever is showing
   it, then `Ctrl+V` on the plate.

   **A PDF or a DXF is read where any picture is taken** — the plan, the
   documents, a space's own drawing, the renders, in the editor and inside the
   deck alike.

   | Dropped | What happens |
   |---|---|
   | JPG · PNG | attached |
   | **PDF** that is a photograph or a scan | the JPEG inside it is lifted straight out |
   | PDF drawn in vector | nothing to lift — export it as JPG/PNG, or snip it (`Win+Shift+S`) |
   | **DXF** | drawn: lines, polylines, arcs, circles, text, and the blocks placed at their own scale and rotation |
   | DWG | AutoCAD's own binary — *Save As → AutoCAD DXF* and drop that |

   The zone says which of these happened rather than failing quietly. What the
   DXF reader does not draw: hatches, splines, line weights, colour. It is a
   picture of a drawing for a client to look at, not a CAD viewer.
4. **Spaces** — add each space, pick the name from the list for the project type
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
5. **Visuals** — drop, pick, or paste the renders onto each space. The first is
   the hero; the rest become the thumbnail strip. `↑` on any thumbnail makes it
   the one the client opens on.

   **A picture carries the number of the space it is of.** Space 07 on the plan
   is **R07**. Where a space holds several renders they count down from it —
   **R07, R06, R05** — one step older each time (Monica, 08.09.2026). Those
   numbers belong to other rooms too, so the same R06 can sit on one space's
   current render and on another's superseded one; inside the deck an older
   render sits behind the current one in the room it belongs to, and it is a
   render forwarded on its own that can name the wrong space. A space near the
   top of the deck runs out of numbers going down: below zero the label falls
   back to the space and the step, **R02-3**.
   The grid reads R01 to R15
   straight down — fifteen cards, checkable at a glance, without opening a
   single one. (Counting renders instead lets the extra angles inside a space
   eat the numbers: the grid comes out R01, R03, R07 and the only way to know
   what is missing is to open all fifteen.) Beside the drop zone, in the same
   place on every space, sits a small **`+ R07`** — the number the next picture
   here will carry, said before it is even picked, and pressing it opens the
   same picker the zone does. (In the client's panel the same control is a
   **`+`** at the end of the thumbnail strip.) A space left out of the deck is
   counted by nothing, because the client never sees it.

   Each space carries four pieces of writing: the **one line** (what it is),
   the **paragraph** (why it sits there), and a **quotable** — one sentence,
   pulled out under an amber rule, meant to be the thing the client repeats to
   someone else. Write the quotable to the type of space, not to the project.

   **The estimate explains itself.** The deck carries a chapter, *04 The
   estimate — How this is worked out*: the rate in a sentence, then every priced
   space with its area, the rate and the amount, and a total under them. Two
   fields on the cover fill the rest of it — **What this rate covers** and
   **What it does not cover**, one line each, printed as lists. The second is
   the half people find out about later; saying it here is what keeps it from
   becoming an argument. A space with no area is not in the table, and a deck
   with no figures has no chapter.

   **Mark the materials on the render.** Press *Mark materials* under a
   space, click the picture where a thing is — the floor, a veneer, a handle —
   and write its name. In the deck those marks blink quietly on the render;
   pressing one takes the picture to it and writes the name on a line drawn back
   to the exact spot, the way a materials board does.

   A tap anywhere on the picture answers, not only a tap on a mark: the picture
   goes to the point touched and names the nearest thing marked. That is only
   as good as the marking is dense — five marks on a render means four wrong
   answers for every right one — so IREO's renders carry twelve to twenty-four
   each, ceiling to floor, and a tap lands on what is under it. Write a mark as
   *the thing · what it is* and the answer comes in two lines: **Wall tile**
   above *Canyon Beige 600x1200, Kajaria*. A mark with only a name stays one
   line rather than inventing a second. Marks are held as
   fractions of the picture, so they stay where they were put at any size, and
   on paper they print as a list under the render because nothing there can be
   pressed.

   Enter puts the name on the mark. In the tool that is enough — the editor
   picks it up and the draft holds it. In a deck opened on its own there is
   nothing behind the page, so marking raises **Keep these names** on the
   picture: it writes the whole deck out again, renders and all, under a
   stamped filename. Until that is pressed the names live only in the open tab.

6. **Narrative** — the note the client reads before the spaces, and the
   representational-purpose disclaimer.
7. **Publish gates** — all nine must pass before `EXPORT DECK` unlocks.

### Two stages of the same deck

**Deck stage**, the first field on Cover, decides what the file is allowed to
claim. *Concept* is the deck that asks whether this is right, and is stamped
**Concept · not for construction**. *Execution* is the deck that is worked to
once it is, and is stamped **For execution · read with the GFC drawings**.

Switching to Execution adds one chapter, **06 The finishes**, and lists the
finishes inside each space as well. Neither is typed: both are the material
marks already placed on the renders, read the other way round — by material,
each one once, against every room it lands in. So the schedule cannot drift
away from the pictures, because it *is* the pictures. A mark written
`Wall tile · Canyon Beige 600x1200, Kajaria` splits at the `·` into what it is
and what it is called; a mark with no product name leaves that column empty
rather than inventing one.

Switching also swaps the word *Concept* for *Execution* in the two lines that
name the document — the cover eyebrow and the kind — and nothing else. Switching
back puts it right. A deck built to on site must not still say Concept on its
cover.

The sample builder takes the same switch: `--execution` as its fifth argument.

`SAVE DRAFT` writes a `.json` holding everything including the images — that is
the real save. The tool also keeps the *text* of your last session in the
browser so a crash does not lose the writing, but images are not kept there;
re-attach them or reopen the draft.

### Where the copy lives

Nothing here depends on a link, a login or a server: the tool is one file, and
so is every deck it makes. That is the point of it, and also the danger — the
laptop holding the file is the only thing holding it.

`BACK UP` answers that. Press it once and the browser asks which folder; point
it at the OneDrive folder that syncs to SharePoint. From then on the draft is
written there — `<project>-deck-draft.json`, overwritten, plus one dated copy a
day beside it — every fifteen minutes when something has changed, and whenever
the button is pressed. Exporting a deck drops that file in the same folder, so
the file a client was actually sent is still there a year later. The tool
uploads nothing itself: it writes to a folder on the machine, and the machine
syncs it, which is why it works with the network down and lands on the server
the moment the network is back.

The state of it reads next to the button — *Backed up 18:12 · essentia decks*.
Chrome and Edge may ask to reconnect the folder when the tool is reopened; that
is one press. Where a browser will not hand over a folder at all, `BACK UP`
writes the draft to Downloads and says that is what it did, rather than looking
as though it had done more.

### What is on the page, and what is behind a number

Under the grid of spaces sit two buttons that need no tapping to find:
**Save all spaces as images** and **Save the whole deck as PDF**. Everything
else is behind a number.

**Every picture in the deck carries a `+` in its corner**, in the same place
each time: on each card in the grid (the picture goes onto that space without
opening it), on the plan (a newer sheet for that floor, pins kept), on each
document page (another document), and at the end of the thumbnail strip inside
an open space. Fifteen spaces means fifteen of them down the grid, so filling in
a deck is a pass down the page rather than fifteen rounds of open, attach,
close. None of them print.

Each card carries its **size and its area** on one line — `10'-10" x 12'-10" ·
139 sq ft` — because the area is what the estimate is worked out from, and an
arithmetic with one of its numbers hidden cannot be checked.

A card whose space has a figure also carries **`Click for estimate`** under it.
Pressed, it reads as the sum it is: **139 sq ft × ₹ 1,200 = ₹ 1,66,800**.
Pressing again puts it away. It waits behind a press rather than being printed
on the card, because a number a client meets before they have looked at the room
is the only thing they will remember about it. The space never opens; a card
with no figure carries no control.

Under the plan and under the documents sit **`+ Upload drawing`** and
**`+ Upload document`**. The corner `+` reissues the sheet it sits on; these add
a new one, as many as the project needs — a second floor, a section, another
signed page. A new drawing brings its own floor tab with it.

The deck footer carries a **Deck built** date and time. If a deck is not
behaving as described here, read that line first — it says which copy is open,
which matters once a few versions have been saved to the same downloads folder.

### What a client gets when they open a space

The number on the drawing opens a panel that scrolls: the render with its own
number in the corner, the other renders as thumbnails — each carrying its
number, with a **`+`** at the end of the series to add the next — the
name, then **size · area · estimate**, then the line,
the paragraph and the quotable. **Size, area and estimate are chips**, the same
weight as the buttons beneath them, so the figures are as easy to find as the
actions. Size and area are facts and do nothing when pressed. The estimate
opens: tapping it shows the arithmetic behind the number — 142 sq ft x 1,200
per sq ft = 1,70,400 — which is simply printed on paper and inside the shared
image, where there is nothing to tap. Under them sits the estimate basis, and
anything entered under **What it includes**. Then six buttons — share, save as image, save as PDF, **add pictures here**,
see it on the plan, and the whole deck.

**Add pictures here** attaches a render to the room while it is open and named,
rather than going back to the form for each of fifteen spaces. It works in the
exported deck too, and the footer will then write the deck out again with them.

**Upload the drawing** and **See the drawing** sit beside it, and inside a space
they belong to *that space*: the working sheet for the room, or the page of the
estimate that prices it, attached to the room rather than to the job. They show
under the room's writing as **Drawings & estimate for this space**, open full
screen when pressed, and print under that room. *See the drawing* falls back to
the job's own drawings when the room has none of its own, and switches off when
there are neither.

In the editor the same thing sits under each space: a zone reading **Drawing or
estimate page for this space**, and each page attached gets a name and a date —
that name is what the client sees on it. Held at 2600px, because these are read
rather than admired.

**Share this space** is the one for a phone: it draws the JPG and hands it to
the share sheet, so it goes to WhatsApp without ever becoming a file anyone has
to find. Where sharing a file is not offered, it saves the image instead.
**See it on the plan** closes the panel and puts the client back on the drawing
with that number held in amber for a moment.

**Save as image** draws that space onto a single 1080px JPG — the essentia
mark, the project and date, the render with **its own number in the corner of
the picture**, the space number, the name, the size, the area, the estimate,
the writing, the quotable, the concept stamp and the disclaimer, all inside the
picture. The render's number is drawn *into* the image rather than beside it,
because this file gets forwarded, cropped and re-saved by people who will never
see the deck it came from.

**A picture carries the number of the space it is of** — R07 is a render of the
space marked 07 on the plan — so a picture that arrives on its own still says
which pin it belongs to, and the grid can be read straight down.

The name is in the corner of the picture itself — on the cards, in the panel, on
the thumbnails, on the shared JPG and on every render in the printed lookbook.
Not underneath it: a caption belongs to the page, and is gone the moment the
picture is lifted out of it or the sheet is photographed.
PDF has to be opened, an image shows itself in the message. Drawn on a canvas
in about a fifth of a second, roughly 200 KB, and it needs no library and no
network. **All as images** in the tool header does the whole deck, one file per
space, saved one at a time so the browser does not refuse the burst.

Under the buttons, **Play** and **Reverse** walk the deck on their own — one
space every 2 seconds, forward or backward, so nobody taps Next fifteen times.
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

### The editor, already full

The tool opens on a sample carrying the plan, the pins and the writing but no
renders — they are five and a half megabytes, and a tool nobody has opened yet
should not weigh that. That is right for a new project and wrong for one already
finished: marking materials on IREO’s renders means having IREO’s renders in the
editor.

```bash
node tools/build-loaded-editor.mjs tools/concept-deck-configurator.html tools/samples/ireo-corridors-concept-deck.html <out.html>
```

It takes a built deck, puts the pictures back into the state that deck carries
(each picture is in the file once, in the markup, with the state’s src stripped)
and writes a copy of the tool that opens on all of it — plan, fifteen pins,
twenty-six renders, the writing. Everything else in the tool works as it does
anywhere else.

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
