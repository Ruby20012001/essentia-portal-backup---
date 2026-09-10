import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, getSession } from "@/lib/auth/session";
import {
  canEditDecks,
  createDeck,
  listDecks,
  listPublicDecks,
} from "@/lib/services/decks";
import { toErrorResponse } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

/** Every deck there is, and whether whoever asked may change one. */
export async function GET() {
  try {
    const session = await getSession().catch(() => null);
    if (!session) {
      return NextResponse.json({ decks: await listPublicDecks(), canEdit: false });
    }
    const [decks, canEdit] = await Promise.all([
      listDecks(session.user),
      canEditDecks(session.user),
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
