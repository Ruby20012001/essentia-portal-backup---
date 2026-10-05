import { describe, expect, it } from "vitest";
import { excerpt, parseTags, TRACKS, visibleTracks } from "@/lib/services/knowledge-logic";

describe("Knowledge Library rules", () => {
  it("has the six Wednesday Year tracks", () => {
    expect(TRACKS).toHaveLength(6);
  });

  it("Strategic Leadership is for L0 and L1 only", () => {
    expect(visibleTracks("L0")).toContain("Strategic Leadership");
    expect(visibleTracks("L1")).toContain("Strategic Leadership");
    expect(visibleTracks("L2")).not.toContain("Strategic Leadership");
    expect(visibleTracks("L3")).toHaveLength(5);
  });

  it("tags are trimmed, de-duplicated ignoring case, and capped", () => {
    expect(parseTags(" Monsoon, carpentry ,, monsoon, wood ")).toEqual(["Monsoon", "carpentry", "wood"]);
    expect(parseTags("")).toEqual([]);
    expect(parseTags(Array.from({ length: 20 }, (_, i) => `t${i}`).join(","))).toHaveLength(12);
  });

  it("a short text comes back whole", () => {
    expect(excerpt("  Wood moves\nin the monsoon. ")).toBe("Wood moves in the monsoon.");
  });

  it("a long text opens near the first match, on whole words", () => {
    const text = `${"filler words here ".repeat(30)}the monsoon swells unsealed teak by two millimetres ${"more text ".repeat(30)}`;
    const e = excerpt(text, "monsoon");
    expect(e.startsWith("… ")).toBe(true);
    expect(e.endsWith(" …")).toBe(true);
    expect(e).toContain("monsoon");
    expect(e.length).toBeLessThanOrEqual(250);
    expect(excerpt(text).startsWith("filler")).toBe(true);
  });
});
