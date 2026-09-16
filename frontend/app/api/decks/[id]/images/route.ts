import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { addDeckPicture } from "@/lib/services/decks";
import { toErrorResponse } from "@/lib/api/errors";
import { invalidId } from "@/lib/api/params";

export const dynamic = "force-dynamic";

/**
 * A new picture for a deck, sent on its own before the deck is saved.
 *
 * The design team only. The picture is kept under its own fingerprint and the
 * address comes back — the deck then carries that address instead of the
 * picture, and stays light enough to open however many renders go into it.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const badId = invalidId(params.id);
  if (badId) return badId;
  try {
    const user = await getCurrentUser();
    const body = (await request.json()) as { src?: unknown };
    const picture = await addDeckPicture(user, params.id, body.src);
    return NextResponse.json(picture, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
