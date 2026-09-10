import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { resettableColleagues } from "@/lib/auth/team-reset";
import { toErrorResponse } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

/**
 * The colleagues this person may reset a password for.
 *
 * Returns [] rather than 403 when they hold no such permission: the list being
 * empty IS the answer, and the client simply shows nothing. A refusal here
 * would tell every signed-in person that the feature exists and they are not
 * trusted with it, which is noise, not security.
 */
export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }
    return NextResponse.json({ colleagues: await resettableColleagues(session.user) });
  } catch (error) {
    return toErrorResponse(error);
  }
}
