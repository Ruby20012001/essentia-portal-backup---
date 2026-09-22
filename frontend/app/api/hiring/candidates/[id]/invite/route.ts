import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import {
  inviteStatus,
  issueInvite,
  revokeInvite,
} from "@/lib/services/candidate-portal";
import { toErrorResponse } from "@/lib/api/errors";
import { invalidId } from "@/lib/api/params";

export const dynamic = "force-dynamic";

/** What HR can see about the candidate's link. Never the token itself. */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const badId = invalidId(params.id);
  if (badId) return badId;
  try {
    const user = await getCurrentUser();
    return NextResponse.json({ invite: await inviteStatus(user, params.id) });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/**
 * Make the link.
 *
 * This is the one response in the portal that carries a secret, and it carries
 * it once: the token is hashed on the way into the database and cannot be read
 * back out. So the reply is marked no-store — a link sitting in a proxy cache
 * is the whole threat this module is written against — and HR is shown it on
 * screen to send. A lost link is reissued, never recovered.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const badId = invalidId(params.id);
  if (badId) return badId;
  try {
    const user = await getCurrentUser();
    const issued = await issueInvite(user, params.id);
    return NextResponse.json(
      { invite: issued },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** Withdraw it. The page stops opening on the next request. */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const badId = invalidId(params.id);
  if (badId) return badId;
  try {
    const user = await getCurrentUser();
    await revokeInvite(user, params.id);
    return NextResponse.json({ invite: null });
  } catch (error) {
    return toErrorResponse(error);
  }
}
