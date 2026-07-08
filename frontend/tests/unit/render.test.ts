import { describe, expect, it } from "vitest";
import { renderTemplate } from "@/lib/services/notifications";

describe("renderTemplate", () => {
  it("substitutes string and number variables", () => {
    expect(
      renderTemplate("WIO {{wioNumber}} — day {{day}} of 15", {
        wioNumber: "WIO/26-27/001/ARCH",
        day: 12,
      }),
    ).toBe("WIO WIO/26-27/001/ARCH — day 12 of 15");
  });

  it("leaves unknown placeholders visible for debugging", () => {
    expect(renderTemplate("{{known}} and {{unknown}}", { known: "x" })).toBe(
      "x and {{unknown}}",
    );
  });

  it("substitutes repeated placeholders everywhere", () => {
    expect(renderTemplate("{{a}}-{{a}}-{{a}}", { a: 1 })).toBe("1-1-1");
  });

  it("returns non-templated text unchanged", () => {
    expect(renderTemplate("plain text", {})).toBe("plain text");
  });
});
