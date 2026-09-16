import { createHash } from "node:crypto";
import { BlockingRuleError } from "@/lib/services/blocking";

/**
 * A picture sent up out of a deck, on its own.
 *
 * A render added in the portal arrives as a data: URL inside the deck. Saved
 * like that, every render makes the deck heavier, and a deck past four and a
 * half megabytes neither saves nor opens — for anybody — because Vercel stops
 * a serverless request and response there. So the tool sends each new picture
 * here before it saves, and the deck keeps only the address that comes back.
 *
 * The address is the picture's own fingerprint. The same picture sent twice is
 * kept once, and a link never starts showing a different picture — which is
 * what lets the picture route tell every browser to keep it for a year.
 */

/** Three megabytes of picture is a data: URL of four, inside what a request may carry. */
export const MAX_PICTURE_BYTES = 3 * 1024 * 1024;

/** What a deck's own JSON may weigh: under a response's 4.5 MB, with its activity beside it. */
export const MAX_DECK_STATE_CHARS = 3500000;

export type DeckPicture = { mime: string; bytes: Buffer; slot: string };

/* A file is what its first bytes say, not what its label says — the picture
   route serves these to anybody with the link, under the type given here. */
const LOOKS_LIKE: Record<string, (b: Buffer) => boolean> = {
  "image/jpeg": (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  "image/png": (b) =>
    b.length > 8 && b.readUInt32BE(0) === 0x89504e47 && b.readUInt32BE(4) === 0x0d0a1a0a,
  "image/webp": (b) =>
    b.length > 12 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP",
};

export function readPicture(src: unknown): DeckPicture {
  const text = typeof src === "string" ? src : "";
  const found = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(text);
  if (!found) {
    throw new BlockingRuleError(
      "That is not a picture a deck can keep. Send a JPG, PNG or WebP.",
    );
  }
  const mime = found[1];
  const bytes = Buffer.from(found[2], "base64");
  if (!LOOKS_LIKE[mime](bytes)) {
    throw new BlockingRuleError("That file is labelled as a picture but is not one.");
  }
  if (bytes.length > MAX_PICTURE_BYTES) {
    throw new BlockingRuleError(
      `That picture is ${(bytes.length / 1048576).toFixed(1)} MB. ` +
        "One picture may be 3 MB at most.",
    );
  }
  const slot = "pic:" + createHash("sha256").update(bytes).digest("hex").slice(0, 32);
  return { mime, bytes, slot };
}

export function pictureAddress(deckId: string, slot: string): string {
  return `/api/decks/${deckId}/images/${encodeURIComponent(slot)}`;
}

/**
 * The deck as it will be written, refused if it would no longer open. The tool
 * sends its pictures up before saving, so only an old copy of the tool still
 * open in somebody's browser should ever meet this.
 */
export function deckStateJson(state: unknown): string {
  const json = JSON.stringify(state ?? {});
  if (json.length > MAX_DECK_STATE_CHARS) {
    throw new BlockingRuleError(
      "This deck is too heavy to save with its pictures inside it. Reload the page " +
        "and save again: the pictures then go up on their own. Nothing saved before is lost.",
    );
  }
  return json;
}
