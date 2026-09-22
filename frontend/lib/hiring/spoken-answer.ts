/**
 * Reading yes and no out of what somebody said into a microphone.
 *
 * Pure, and deliberately in its own file rather than inside the component
 * that uses it — this is the one piece of the browser-voice flow that can be
 * tested without a browser, and it is the piece where being wrong costs the
 * most. A "no" read as a "yes" leaves a candidate expected in a room they
 * already said they could not reach.
 *
 * It decides which question gets asked next. It never decides what gets
 * written down: `CandidateVoice.tsx` puts the transcript on the screen and
 * waits for the person to press send, because recognition is wrong often
 * enough that "I can do Tuesday" arrives as "I can't do Tuesday".
 *
 * NO MODEL, ON PURPOSE. The page already knows who this is — it was opened
 * with a token — and the question has exactly two answers. A model here would
 * add a bill, a dependency and a way to be talked into something, and would
 * answer nothing that is actually being asked.
 */

/* Both languages this office speaks, romanised and in Devanagari. */
const YES = [
  "yes", "yeah", "yep", "sure", "correct", "confirm", "confirmed",
  "i will be there", "i'll be there", "that works", "fine", "ok", "okay",
  "haan", "haa", "ha ji", "haan ji", "theek hai", "thik hai", "ji haan",
  "हाँ", "हां", "ठीक है", "जी हाँ",
];

const NO = [
  "no", "nope", "cannot", "can't", "cant", "unable", "not possible",
  "does not work", "doesn't work", "another time", "reschedule", "change",
  "nahi", "nahin", "na ji", "nahi ho payega", "nahi aa sakta",
  "nahi aa sakti", "mushkil", "nahi ho paayega",
  "नहीं", "नही", "नहीं हो पाएगा",
];

/**
 * Whole words only, with the text padded at both ends so the first and last
 * word match like any other. Substring matching is how "November" becomes a
 * "no" and "Thursday" becomes a "haa".
 */
function heard(text: string, list: string[]): boolean {
  const t = ` ${text.toLowerCase().replace(/[.,!?]/g, " ").replace(/\s+/g, " ").trim()} `;
  return list.some((word) => t.includes(` ${word} `));
}

/** No is checked first: "no, but yes to Thursday" has confirmed nothing. */
export function readAnswer(text: string): "yes" | "no" | null {
  if (heard(text, NO)) return "no";
  if (heard(text, YES)) return "yes";
  return null;
}
