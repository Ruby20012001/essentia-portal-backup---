import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getDeck, saveDeck, type DeckStage } from "@/lib/services/decks";
import { toErrorResponse } from "@/lib/api/errors";
import { invalidId } from "@/lib/api/params";

export const dynamic = "force-dynamic";

/** One deck, its activity, and whether this person may change it. */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const badId = invalidId(params.id);
  if (badId) return badId;
  try {
    const user = await getCurrentUser();
    const deck = await getDeck(user, params.id);
    return NextResponse.json({ deck });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/**
 * A save carries the version it opened. Somebody else having saved in between
 * is a 409 with what happened in words, not a silent overwrite.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const badId = invalidId(params.id);
  if (badId) return badId;
  try {
    const user = await getCurrentUser();
    const body = (await request.json()) as {
      state?: unknown;
      version?: number;
      name?: string;
      projectCode?: string | null;
      stage?: DeckStage;
      what?: string;
      did?: string[];
    };
    if (typeof body.version !== "number") {
      return NextResponse.json(
        { error: "A save must say which version it opened." },
        { status: 400 },
      );
    }
    const saved = await saveDeck(user, params.id, {
      state: body.state ?? {},
      version: body.version,
      name: body.name,
      projectCode: body.projectCode,
      stage: body.stage,
      what: body.what,
      did: Array.isArray(body.did) ? body.did : [],
    });
    return NextResponse.json(saved);
  } catch (error) {
    return toErrorResponse(error);
  }
}
