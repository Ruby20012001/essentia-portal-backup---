import { describe, expect, it } from "vitest";
import { BlockingRuleError } from "@/lib/services/blocking";
import {
  MAX_DECK_STATE_CHARS,
  MAX_PICTURE_BYTES,
  deckStateJson,
  pictureAddress,
  readPicture,
} from "@/lib/services/deck-pictures";

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
const WEBP = Buffer.concat([Buffer.from("RIFF"), Buffer.from([0x24, 0, 0, 0]), Buffer.from("WEBPVP8 ")]);

const dataUrl = (mime: string, bytes: Buffer) => `data:${mime};base64,${bytes.toString("base64")}`;

describe("readPicture", () => {
  it("keeps a JPG under its fingerprint", () => {
    const got = readPicture(dataUrl("image/jpeg", JPEG));
    expect(got.mime).toBe("image/jpeg");
    expect(got.bytes.equals(JPEG)).toBe(true);
    expect(got.slot).toMatch(/^pic:[0-9a-f]{32}$/);
  });

  it("gives the same picture the same address, and a different one another", () => {
    const once = readPicture(dataUrl("image/jpeg", JPEG)).slot;
    const again = readPicture(dataUrl("image/jpeg", Buffer.from(JPEG))).slot;
    const other = readPicture(dataUrl("image/jpeg", Buffer.concat([JPEG, Buffer.from([1])]))).slot;
    expect(again).toBe(once);
    expect(other).not.toBe(once);
  });

  it("takes PNG and WebP", () => {
    expect(readPicture(dataUrl("image/png", PNG)).mime).toBe("image/png");
    expect(readPicture(dataUrl("image/webp", WEBP)).mime).toBe("image/webp");
  });

  it("refuses a file whose bytes are not the picture its label says", () => {
    expect(() => readPicture(dataUrl("image/png", JPEG))).toThrow(BlockingRuleError);
    expect(() => readPicture(dataUrl("image/jpeg", Buffer.from("<svg></svg>")))).toThrow(
      /not one/,
    );
  });

  it("refuses anything that is not a picture's data", () => {
    for (const src of [undefined, 42, "", "https://example.com/a.jpg",
      "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=", "data:image/jpeg,notbase64"]) {
      expect(() => readPicture(src)).toThrow(/JPG, PNG or WebP/);
    }
  });

  it("refuses a picture over 3 MB, and says how large it was", () => {
    const big = Buffer.concat([JPEG, Buffer.alloc(MAX_PICTURE_BYTES)]);
    expect(() => readPicture(dataUrl("image/jpeg", big))).toThrow(/3\.0 MB/);
  });
});

describe("pictureAddress", () => {
  it("points at the picture route, with the slot escaped", () => {
    expect(pictureAddress("d7114344-cacf-4396-9c79-412411268fa2", "pic:ab12")).toBe(
      "/api/decks/d7114344-cacf-4396-9c79-412411268fa2/images/pic%3Aab12",
    );
  });
});

describe("deckStateJson", () => {
  it("writes a deck of addresses as it is", () => {
    const state = { spaces: [{ images: [{ src: "/api/decks/x/images/pic%3Aab" }] }] };
    expect(JSON.parse(deckStateJson(state))).toEqual(state);
  });

  it("refuses a deck that would be too heavy to open again", () => {
    const heavy = { spaces: [{ images: [{ src: "data:image/jpeg;base64," + "A".repeat(MAX_DECK_STATE_CHARS) }] }] };
    expect(() => deckStateJson(heavy)).toThrow(/too heavy/);
  });
});
