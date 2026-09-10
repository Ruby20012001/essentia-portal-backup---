import { NextRequest, NextResponse } from "next/server";
import { getDeckImage } from "@/lib/services/decks";
import { toErrorResponse } from "@/lib/api/errors";
import { invalidId } from "@/lib/api/params";

export const dynamic = "force-dynamic";

/**
 * One picture out of a deck.
 *
 * The deck's own JSON carries no image data — a deck of thirty renders is five
 * and a half megabytes, and a serverless response stops at four and a half, so
 * sending them together meant sending nothing at all. Each picture is a row,
 * addressed by slot, and the state points at this route.
 *
 * Open, like the deck it belongs to. A slot is only reachable by knowing the
 * deck it is in, and the deck is readable by anybody with the link — that was
 * decided knowingly (Monica, 10 Sep 2026).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string; slot: string } },
) {
  const badId = invalidId(params.id);
  if (badId) return badId;
  try {
    const slot = decodeURIComponent(params.slot);
    const image = await getDeckImage(params.id, slot);
    if (!image) {
      return NextResponse.json({ error: "No such picture" }, { status: 404 });
    }
    return new NextResponse(new Uint8Array(image.bytes), {
      headers: {
        "Content-Type": image.mime,
        /* A picture in a deck does not change — a new one takes a new slot.
           So it is worth caching hard: thirty renders otherwise means thirty
           round trips every time somebody turns a page. */
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
