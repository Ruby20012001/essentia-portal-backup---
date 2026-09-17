import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { sendWelcomeLetter } from "@/lib/services/welcome-letter";
import { toErrorResponse } from "@/lib/api/errors";
import { invalidId } from "@/lib/api/params";

export const dynamic = "force-dynamic";

/**
 * Velocity Gate 8 — send the Welcome Letter. Refuses with 422 and the exact
 * reason when the TL has not read to the bottom. The disabled button in the UI
 * is a courtesy; this is the rule.
 */
export async function POST(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const badId = invalidId(params.id);
  if (badId) return badId;
  try {
    const user = await getCurrentUser();
    const letter = await sendWelcomeLetter(user, params.id);
    return NextResponse.json(letter, { status: 200 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
