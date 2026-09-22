import { describe, expect, it } from "vitest";
import { readAnswer } from "@/lib/hiring/spoken-answer";

/**
 * Reading yes and no out of what somebody said.
 *
 * This is the only piece of the browser-voice flow worth testing on its own,
 * and it is worth testing hard. Everything else on that component is the
 * browser's speech API, which cannot run here — but this function is pure,
 * and getting it wrong is the expensive failure: a "no" read as a "yes"
 * leaves a candidate expected in a room they already said they cannot reach,
 * and a "yes" read as a "no" has somebody rebook four diaries for nothing.
 *
 * Which is why the component never sends a reschedule on this function's word
 * alone — the transcript goes on screen and the person presses the button.
 * This decides which question gets asked next, not what gets written down.
 */

describe("yes", () => {
  it("reads the ordinary ways of saying it", () => {
    for (const said of [
      "yes",
      "Yes.",
      "yeah that works",
      "sure",
      "I will be there",
      "that works for me",
      "ok",
      "confirmed",
    ]) {
      expect(readAnswer(said), said).toBe("yes");
    }
  });

  it("reads Hindi, romanised and in Devanagari", () => {
    for (const said of ["haan", "haan ji", "theek hai", "हाँ", "ठीक है", "ji haan"]) {
      expect(readAnswer(said), said).toBe("yes");
    }
  });
});

describe("no", () => {
  it("reads the ordinary ways of saying it", () => {
    for (const said of [
      "no",
      "I cannot",
      "I can't make that",
      "that does not work",
      "sorry, not possible",
      "can we reschedule",
      "another time please",
    ]) {
      expect(readAnswer(said), said).toBe("no");
    }
  });

  it("reads Hindi", () => {
    for (const said of [
      "nahi",
      "nahin",
      "nahi ho payega",
      "nahi aa sakta",
      "नहीं",
      "mushkil hai",
    ]) {
      expect(readAnswer(said), said).toBe("no");
    }
  });
});

describe("the sentences that could go either way", () => {
  it("treats a refusal with a yes in it as a refusal", () => {
    // The failure this ordering exists to stop. Somebody saying "no, but yes
    // to Thursday" has not confirmed anything.
    expect(readAnswer("no but yes to Thursday")).toBe("no");
    expect(readAnswer("nahi, par haan agle hafte")).toBe("no");
    expect(readAnswer("that works but I cannot do Wednesday")).toBe("no");
  });

  it("does not find a word inside a longer word", () => {
    // "no" inside "November", "ha" inside "Thursday" — matching on substrings
    // rather than whole words is how a date becomes an answer.
    expect(readAnswer("November")).toBeNull();
    expect(readAnswer("Thursday")).toBeNull();
    expect(readAnswer("nothing")).toBeNull();
  });

  it("gives up rather than guess", () => {
    for (const said of ["", "   ", "hello", "who is this", "what interview"]) {
      expect(readAnswer(said), said).toBeNull();
    }
  });

  it("ignores punctuation and capitals", () => {
    expect(readAnswer("YES!")).toBe("yes");
    expect(readAnswer("No, sorry.")).toBe("no");
    expect(readAnswer("  haan  ")).toBe("yes");
  });
});
