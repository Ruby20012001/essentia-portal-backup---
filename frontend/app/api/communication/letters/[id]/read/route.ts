import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { markLetterRead } from "@/lib/services/welcome-letter";
import { toErrorResponse } from "@/lib/api/errors";
import { invalidId } from "@/lib/api/params";

export const dynamic = "force-dynamic";

/**
 * The TL reached the bottom of the letter. This is the only thing that opens
 * the send button (CLAUDE.md permanent constraint), and it is recorded against
 * a named person with a timestamp.
 */
export async function POST(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const badId = invalidId(params.id);
  if (badId) return badId;
  try {
    const user = await getCurrentUser();
    const letter = await markLetterRead(user, params.id);
    return NextResponse.json(letter, { status: 200 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
