/**
 * Builds the worked IREO Corridors sample deck from the renders extracted out
 * of the signed lookbook, using the configurator's own core CSS + viewer JS so
 * the sample is byte-identical to what "Export deck" produces.
 *
 *   node tools/build-sample-deck.mjs \
 *     tools/concept-deck-configurator.html <imagesDir> \
 *     frontend/public/brand/logo-dark.png tools/samples/ireo-corridors-concept-deck.html
 *
 * NOT reproducible from a clean checkout on its own. <imagesDir> must hold the
 * renders lifted out of the source PDFs, which are not in this repo:
 *   img_001..023.jpg  — the 23 renders inside
 *     "9.) 3DS/1.)LOOKBOOK/ireo lookbook 05.08.2026.pdf" (JPEG XObjects, in
 *     document order; a number in SPACES below indexes this set)
 *   plan_ground.png   — the ground floor sheet, 1190x845
 *   ext_store.jpg / ext_utility.jpg — supplied separately, see SPACES
 * The committed sample under tools/samples/ is therefore the artefact of
 * record. This script exists to show how it was assembled and to rebuild it
 * when the deck template changes — not as a step anyone has to run.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const [tool, imgDir, logoPath, out] = process.argv.slice(2);
const src = fs.readFileSync(tool, 'utf8');

/* anchored at line start so prose inside the file's header comment that merely
   mentions these tags cannot be mistaken for the tags themselves */
const grab = (open, close) => {
  const a = src.indexOf('\n' + open);
  if (a < 0) throw new Error('missing ' + open);
  const from = a + 1 + open.length;
  const b = src.indexOf(close, from);
  if (b < 0) throw new Error('unterminated ' + open);
  return src.slice(from, b);
};
const core = grab('<style id="core">', '</style>');
const viewer = grab('<script id="viewer">', '</script>');

/* A number is a render lifted out of the lookbook (img_0NN.jpg); a string is a
   file supplied separately. Both resolve against imgDir. */
const jpg = (ref) => 'data:image/jpeg;base64,' + fs.readFileSync(
  path.join(imgDir, typeof ref === 'number' ? 'img_' + String(ref).padStart(3, '0') + '.jpg' : ref)
).toString('base64');

/* Area is arithmetic on the two dimensions already read off the drawing — never
   a figure anyone typed in. A dims string with only one measurement ("8'-9\"
   wide", "10'-0\" across") gets no area rather than a guessed one. Marked
   approximate because a room on this plan is not a perfect rectangle. */
const FT_IN = /(\d+)'\s*-\s*(\d+)"/g;
function areaFromDims(dims) {
  const m = [...String(dims || '').matchAll(FT_IN)];
  if (m.length !== 2) return '';
  const feet = m.map(([, f, i]) => Number(f) + Number(i) / 12);
  return '≈ ' + Math.round(feet[0] * feet[1]) + ' sq ft';
}

/* Image → space, resolved by each render's byte offset in the lookbook against
   the offset of the section heading above it. Verified against the visuals.
   The home office pages carry no heading of their own in the lookbook, so an
   offset lookup files 18 and 19 under master bath; they are the home office.
   store room and utility come from images supplied by Monica on 01.09.2026,
   and the second balcony reuses the balcony render that already exists. */
/* Every dimension, level change and fitting named below is read off the ground
   floor sheet — nothing about this house is invented. Copy signed off by
   Monica Chawla, principal designer, 2026-09-01. */
const SPACES = [
  {
    name: 'entrance foyer', dims: "8'-9\" wide", x: 0.727, y: 0.585, imgs: [2, 3],
    summary: 'You arrive into a room, not a corridor.',
    body:
      "Eight feet nine inches of width before the house asks anything of you. A stone console doubles " +
      "as the shoe rack, so nothing has to be carried further in than the door. Art sits on the wall " +
      "you face rather than the wall you pass, and the distribution board is set into the return, out " +
      "of the eyeline.",
    quote: 'The first room should ask nothing of you. It should simply receive you.',
  },
  {
    name: 'formal living area', dims: "32'-3\" x 14'-7\"", x: 0.555, y: 0.329, imgs: [1, 4, 5, 6],
    summary: 'Thirty two feet of one room, held as a single idea.',
    body:
      "The long axis runs 32'-3\" from the balcony end to the dining end, seating set out at 12'-10\" " +
      "and 14'-7\" across. The mini bar sits on the kitchen side so service never crosses the seating. " +
      "The wall it shares with the kid's bedroom is a lego wall — the children are in the room without " +
      "being underfoot.",
    quote: 'Length is not a measurement. It is a distance the eye is allowed to travel.',
  },
  {
    name: 'kitchen', dims: "10'-10\" x 12'-10\"", x: 0.559, y: 0.822, imgs: [20, 21],
    summary: 'Planned around the cook, not around the cabinetry.',
    body:
      "Prep counter to both sides of the hob with the chimney above it, so the working triangle closes " +
      "without a step wasted. The microwave and oven stack into one tall unit instead of eating the " +
      "counter. Storage below, storage overhead, and the utility door within reach of the sink.",
    quote: 'A kitchen is measured in steps taken, not in square feet drawn.',
  },
  {
    name: 'utility', dims: "5'-6\" x 7'-11\"", x: 0.737, y: 0.873, imgs: ['ext_utility.jpg'],
    summary: 'The service room, with the washing machine set below the counter.',
    body:
      "It sits behind the kitchen and takes its own door, so laundry never travels through the house. " +
      "The machine is built in below a working counter rather than left standing, which keeps a folding " +
      "surface at hand and the floor clear.",
    quote: 'A house is judged by its quiet rooms long after the grand ones are admired.',
  },
  {
    name: 'store room', dims: "4'-4\" x 4'-2\"", x: 0.392, y: 0.669, imgs: ['ext_store.jpg'],
    summary: "4'-4\" by 4'-2\", shelved to full height.",
    body:
      "A dedicated store off the bedroom passage, fitted out floor to ceiling so the depth is used " +
      "rather than stacked. It takes what a house accumulates — luggage, seasonal linen, the spare of " +
      "everything — out of the wardrobes that are meant for clothes.",
    quote: 'Storage that is planned goes unnoticed. Storage that is improvised is noticed for years.',
  },
  {
    name: 'powder washroom', dims: "6'-10\" x 4'-2\"", x: 0.790, y: 0.704, imgs: [22, 23],
    summary: 'Off the foyer, for the people who are not staying.',
    body:
      "Placed so a guest reaches it from the entrance without entering the house proper. The floor is " +
      "set 10 mm down, which keeps water where it belongs without a threshold to catch a heel.",
    quote: 'Hospitality is answering the question before it is asked.',
  },
  {
    name: 'master bedroom', dims: "9'-1\" x 15'-7\"", x: 0.205, y: 0.390, imgs: [15],
    summary: 'One whole wall given to wardrobe, so the floor stays clear.',
    body:
      "The long wall carries the wardrobe run — storage above, drawer storage below — which lets the bed " +
      "face the balcony rather than the storage. A full length mirror sits at the dressing end and art " +
      "on the head wall.",
    quote: 'The last thing seen at night deserves more thought than a cupboard door.',
  },
  {
    name: 'master bathroom', dims: "6'-0\" x 6'-5\"", x: 0.139, y: 0.685, imgs: [16, 17],
    summary: 'Wet and dry separated by 20 mm of level, not by a threshold.',
    body:
      "The shower is stepped 20 mm up rather than kerbed, so there is nothing to trip on and nothing to " +
      "clean around. A stone niche is cut into the shower wall so bottles do not stand on the floor.",
    quote: 'Twenty millimetres, well placed, is the whole difference between a wet floor and a dry one.',
  },
  {
    name: 'bedroom-2', dims: "10'-1\" x 11'-7\"", x: 0.311, y: 0.320, imgs: [10, 11],
    summary: 'The second bedroom, with its own door onto the balcony.',
    body:
      "It shares the long north balcony with the master bedroom, so it gets the planting and the light " +
      "without borrowing anything from the other room. Wardrobe on the inner wall, mirror at full length " +
      "beside it, art above the bed.",
    quote: 'Give a second bedroom a door to the light and it ceases to be a spare room.',
  },
  {
    name: 'bath-2', dims: "6'-4\" x 5'-10\"", x: 0.282, y: 0.707, imgs: [13, 14],
    summary: 'Reached from the passage, so it serves the room and the floor.',
    body:
      "Entered off the passage rather than through the bedroom, which means the second bedroom and the " +
      "rest of the floor never wait on each other. The shower takes the far corner, keeping the vanity " +
      "dry.",
    quote: 'A shared bathroom succeeds on the day nobody has to knock.',
  },
  {
    name: "kid's bedroom", dims: "10'-0\" across", x: 0.782, y: 0.318, imgs: [7, 8],
    summary: 'Storage at reach height, and the lego wall shared with the living room.',
    body:
      "Open storage where a child can get to it, overhead storage above for everything else — the things " +
      "used every day are the things within reach. The wall it shares with the formal living area is " +
      "surfaced for lego, so play happens where the family already is.",
    quote: "Set the storage at a child's height and the room begins to keep itself.",
  },
  {
    name: "kid's bath", dims: "4'-8\" x 4'-10\"", x: 0.891, y: 0.343, imgs: [9],
    summary: 'Entered from the bedroom, not from the passage.',
    body:
      "Three steps from the bed and no corridor in between, which is the whole point at two in the " +
      "morning. The shower is dropped 30 mm and a counter niche holds what would otherwise sit on the " +
      "floor.",
    quote: "A child's bathroom is measured from the bed, never from the door.",
  },
  {
    name: 'balcony', dims: "20'-3\" x 5'-7\"", x: 0.326, y: 0.124, imgs: [12],
    summary: 'Twenty feet of planted edge, shared by both bedrooms.',
    body:
      "The long balcony runs the full face of the two bedrooms and is planted along its length, so the " +
      "first thing either room sees is green rather than parapet. A sculptural bench sits at the centre — " +
      "somewhere to sit that is not furniture anyone has to move.",
    quote: 'A balcony is a room. It becomes a ledge only when it is furnished as one.',
  },
  {
    name: 'balcony', dims: "9'-10\" x 3'-10\"", x: 0.294, y: 0.808, imgs: [12],
    summary: 'The smaller balcony at the service end, planted the same way.',
    body:
      "It sits at the far end of the plan and carries the same planting as the long balcony, so the view " +
      "out of the bathrooms and the passage is a garden edge rather than a blank one.",
    quote: 'Even the quiet side of a house deserves something worth looking at.',
  },
  {
    name: 'home office', dims: "5'-6\" x 9'-10\"", x: 0.892, y: 0.746, imgs: [18, 19],
    summary: 'A working room at the service end, with a door that closes.',
    body:
      "Placed beyond the powder washroom rather than off the living area, so a call does not have to " +
      "compete with the house and the house does not have to go quiet for a call. Storage runs the full " +
      "length of one wall.",
    quote: 'Work is far easier to set down in a room that can be closed.',
  },
];

const state = {
  v: 1,
  type: 'Residence',
  logo: 'data:image/png;base64,' + fs.readFileSync(logoPath).toString('base64'),
  project: {
    name: 'IREO Corridors',
    client: '',
    contact: 'Preeti Kardam',
    address: 'IREO Corridors · Gurugram',
    code: '',
    eyebrow: 'CONCEPT DECK · PRIVATE RESIDENCE',
    headline: 'A house you can read before you can walk it.',
    slogan: 'different by design',
    closing:
      'Everything here is a beginning, not a conclusion. Tell us where it is wrong, ' +
      'and it changes — that is what a concept is for.',
    kind: 'Interior Concept Deck',
    dateLabel: 'September 2026',
    confidentiality: 'Confidential',
    autoSeconds: '5',
    /* essentia's own published rate for Interior Design including FF&E, as it
       stands in the Fee Configurator — taken from there, not assumed here. The
       basis line prints under the figures so the number cannot be read as a
       quotation; change either and every space reprices. */
    rate: '1200',
    estimateBasis: 'Indicative only — at essentia published rate of ₹ 1,200 / sq.ft. Not a quotation.',
    designer: 'Monica Chawla',
    firm: 'essentia environments',
    firmLine: 'essentia Design & Project Partners · Sector 34, Gurugram · Since 1999',
    site: 'essentiaenvironments.com',
  },
  plates: [{
    label: 'Ground floor',
    src: 'data:image/png;base64,' +
      fs.readFileSync(path.join(imgDir, 'plan_ground.png')).toString('base64'),
    w: 1190, h: 845,
  }],
  spaces: SPACES.map((s, i) => ({
    id: 'ireo' + i,
    include: true,
    name: s.name,
    floor: 'Ground floor',
    dims: s.dims || '',
    area: areaFromDims(s.dims),
    includes: '',
    estimate: '',            /* a money figure is nobody's to invent — Monica fills these */
    summary: s.summary || '',
    body: s.body || '',
    quote: s.quote || '',
    plate: 0,
    x: s.x == null ? null : s.x,
    y: s.y == null ? null : s.y,
    images: s.imgs.map((n) => ({ src: jpg(n), w: 0, h: 0 })),
  })),
  narrative: {
    lead: 'A drawing is a language. Nobody should have to learn it to see their own home.',
    quote: 'Touch a number, and the room answers for itself.',
    body:
      'A plan records where the walls fall. It does not say which window the morning arrives ' +
      'through, or what it will feel like to set a bag down at the end of a long day. Those are ' +
      'the things a house is actually chosen for, and they are the things a drawing keeps to ' +
      'itself.\n\n' +
      'So every space on this plan carries a number. Touch it and the room opens — how large it ' +
      'is, where it sits, what it holds, and why it sits there rather than anywhere else. The ' +
      'reasoning is written beside the room it belongs to, not held back for a meeting.\n\n' +
      'Nothing here needs anyone standing beside you to explain it. That is the whole intention.',
    disclaimer:
      'All the 3Ds in this deck are for representational purpose for design intent only, and are ' +
      'subject to changes according to the site conditions.',
  },
};

/* Run the configurator's own viewer to write the document out, exactly as
   "Export deck" does in the browser — so the sample cannot drift from what the
   tool produces. The deck must read with the script blocked or never run. */
const sandbox = { window: {}, document: { getElementById: () => null } };
sandbox.globalThis = sandbox;
vm.runInNewContext(viewer, sandbox);
const deck = sandbox.window.EssentiaDeck;
if (!deck || typeof deck.html !== 'function') throw new Error('viewer did not expose EssentiaDeck.html');

state.built = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) +
  " " + new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

const prerendered = deck.html(state, { noIndex: true });

/* the state alongside it carries no image data — every picture is in the
   markup once already, and mount() harvests it back out of the DOM */
const slim = JSON.parse(JSON.stringify(state));
slim.logo = '';
slim.plates.forEach((p) => { p.src = ''; });
slim.spaces.forEach((s) => (s.images || []).forEach((im) => { im.src = ''; }));

const html =
`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>IREO Corridors · concept deck</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Lato:wght@300;400;700&display=swap" rel="stylesheet">
<style>html,body{margin:0;padding:0;background:#fff}</style>
<style>${core}</style>
</head>
<body class="deck-scope">
<div id="deck-root" data-prerendered="1">${prerendered}</div>
<script>window.__DECK__=${JSON.stringify(slim).replace(/<\//g, '<\\/')};<\/script>
<script>${viewer}<\/script>
</body>
</html>
`;

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
const imgCopies = (html.match(/data:image\/[a-z]+;base64,/g) || []).length;
console.log('wrote', out, (html.length / 1048576).toFixed(2) + ' MB');
console.log('spaces:', state.spaces.length,
  '· with visuals:', state.spaces.filter((s) => s.images.length).length,
  '· empty:', state.spaces.filter((s) => !s.images.length).map((s) => s.name).join(', '));
console.log('images embedded:', imgCopies,
  '· expected:', 2 + state.spaces.reduce((n, s) => n + s.images.length, 0),
  '· readable without JS:', /class="deck-print-space"/.test(html));
