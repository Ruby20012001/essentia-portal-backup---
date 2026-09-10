import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { canEditDecks, createDeck, listDecks } from "@/lib/services/decks";
import { toErrorResponse } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

/** Every deck anybody signed in may read, and whether this person may change one. */
export async function GET() {
  try {
    const user = await getCurrentUser();
    const [decks, canEdit] = await Promise.all([
      listDecks(user),
      canEditDecks(user),
    ]);
    return NextResponse.json({ decks, canEdit });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** A new deck. The state is the tool's own, with the pictures already out of it. */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    const body = (await request.json()) as {
      name?: string;
      projectCode?: string | null;
      state?: unknown;
    };
    const deck = await createDeck(user, {
      name: body.name ?? "",
      projectCode: body.projectCode ?? null,
      state: body.state ?? {},
    });
    return NextResponse.json({ deck }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
