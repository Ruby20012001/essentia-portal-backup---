import { describe, expect, it } from "vitest";
import { inviteMessage, waNumber } from "@/lib/services/candidate-contact";

/**
 * Turning what is on a candidate's record into something WhatsApp will take.
 *
 * This is the expensive one to get wrong, and quietly so: a number that is
 * mangled rather than rejected sends a stranger somebody's private interview
 * link, and nobody at essentia ever finds out. So the rule is that anything
 * not clearly recognisable is refused rather than guessed at, and these tests
 * are mostly about the refusing.
 */

describe("numbers WhatsApp will take", () => {
  it("assumes a bare ten-digit mobile is Indian", () => {
    expect(waNumber("9810011122")).toBe("919810011122");
    expect(waNumber("98100 11122")).toBe("919810011122");
    expect(waNumber("98100-11122")).toBe("919810011122");
  });

  it("leaves a number that already has the country code alone", () => {
    expect(waNumber("+91 98100 11122")).toBe("919810011122");
    expect(waNumber("919810011122")).toBe("919810011122");
    expect(waNumber("+91-98100-11122")).toBe("919810011122");
  });

  it("drops the trunk zero people write in front", () => {
    expect(waNumber("098100 11122")).toBe("919810011122");
  });

  it("passes a genuinely foreign number through", () => {
    // A candidate abroad. 44 is the UK; assuming 91 would be wrong.
    expect(waNumber("+44 7700 900123")).toBe("447700900123");
  });
});

describe("numbers it refuses", () => {
  it("refuses anything too short to be a phone number", () => {
    for (const bad of ["", "   ", "123", "98100", "1234567", "abcdefghij"]) {
      expect(waNumber(bad), bad).toBeNull();
    }
  });

  it("refuses anything too long", () => {
    expect(waNumber("1234567890123456789")).toBeNull();
  });

  it("refuses a landline with an extension written in", () => {
    // "0124 4567890 ext 22" — digits run together into something that is not
    // a mobile. Guessing here is how a link reaches a switchboard.
    expect(waNumber("0124 4567890 ext 2211")).toBeNull();
  });
});

describe("the message", () => {
  const message = inviteMessage({
    candidateName: "Aarti Sethi",
    roleTitle: "Junior Draughtsman",
    url: "https://portal.example/interview/abc123",
    senderName: "Shivani",
  });

  it("says who it is from, by name", () => {
    expect(message).toContain("Shivani");
    expect(message).toContain("essentia");
  });

  it("uses their first name, not their full name", () => {
    expect(message).toContain("Hello Aarti,");
    expect(message).not.toContain("Hello Aarti Sethi");
  });

  it("carries the link and the role", () => {
    expect(message).toContain("https://portal.example/interview/abc123");
    expect(message).toContain("Junior Draughtsman");
  });

  it("asks them not to forward it", () => {
    expect(message).toMatch(/do not forward/i);
  });

  it("carries nothing the page itself will show", () => {
    // A WhatsApp message gets forwarded and screenshotted. The interview time,
    // the panel and the money live behind the token, which has a fence around
    // it; the message must not put them in front of it.
    expect(message).not.toMatch(/\d{1,2}:\d{2}/); // no time of day
    expect(message).not.toMatch(/salary|ctc|lakh|₹/i);
    expect(message).not.toMatch(/panel|interviewer/i);
  });
});
