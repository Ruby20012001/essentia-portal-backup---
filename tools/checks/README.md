# Checks for the concept deck

These drive a headless Chrome over the DevTools protocol and read the real live
deck, but **never write to it**. They are how the deck work in this repo is
verified: what a reader's page actually fetches, whether a 360 turns, whether a
PDF waits for its pictures, what an editor's sitting does to a deck.

Node 20+ and Chrome. Start Chrome once:

```bash
"C:\Program Files\Google\Chrome\Application\chrome.exe" --headless=new \
  --remote-debugging-port=9333 --user-data-dir=<a scratch folder> about:blank
```

Two local servers stand in for the portal. Both serve **this worktree's** tool
file at `/deck/<id>` and `/tools/concept-deck.html`, so what is checked is the
file you are editing; every GET under `/api` goes to the live site.

```bash
# read-only: nothing but GET ever leaves
node tools/checks/deck-proxy.cjs tools/concept-deck-configurator.html 4188

# an editor's page: canEdit true, and every save and picture upload is kept in
# memory here (GET /__writes lists them). With a reader=1 cookie it is a
# reader's page instead. The live deck is never written to.
node tools/checks/deck-proxy-mock.cjs tools/concept-deck-configurator.html 4189
```

| Script | What it answers |
|---|---|
| `load-profile.mjs <url> [w] [h] [secs]` | Every request on a cold load: size, when, who asked. Use it before and after any change that touches pictures. |
| `lazy-check.mjs <url> [shot.png]` | How many pictures a reader fetches on opening, and that the material swatches are cut once their rows come near. |
| `print-check.mjs <url>` | Save as PDF for a room and for the whole deck call the printer only once the printed pages have their pictures. |
| `width-fix-probe.mjs <url> [reader]` | The reading page's width at 390 px, and anything sticking past the edge. |
| `shot-materials.mjs <url> <out.png> [w] [h] [reader\|dark]` | A picture of the materials chapter. |
| `editor-sitting.mjs <base> <out dir>` | A whole editor's sitting against the mock: the materials card, a 16th space with a picture and a pin, a save, a reload. |
| `pano-sitting.mjs <out dir>` | The 360: draws a test panorama, uploads it, opens it, turns it with mouse and finger, pinches, saves, reloads, and reads it on a phone with no account. |
| `pano-export-check.mjs <out dir>` | A deck exported from the plain tool opens its 360 from disk, with no server. |
| `stamped-check.mjs <tool.html> <pano.jpg> [shot.png]` | The stamped delivery copy, opened from disk: the build stamp, the Materials card, a 360 going in and turning. |
| `live-sheet-check.mjs` | The live deck signed out: a room opens, the 360 code is there, a reader is offered no way to add one, nothing throws. |
| `card-scroll-check.mjs` | The editor's Materials card cuts its swatches when it comes into view. |
| `ocr-try.mjs`, `ocr-probe2.mjs` | Unfinished: reading the room names off a plan with tesseract.js, for automatic room numbers. See `docs/HANDOVER.md` §4.1. |

Most of them print `ok` / `FAIL` lines and exit non-zero on a failure.
