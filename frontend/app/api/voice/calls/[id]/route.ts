import { NextRequest, NextResponse } from "next/server";
import { closeCall, roundsForCall } from "@/lib/services/voice-agent";
import { toErrorResponse } from "@/lib/api/errors";
import { invalidId } from "@/lib/api/params";
import { notTheAgent } from "@/lib/api/voice-auth";

export const dynamic = "force-dynamic";

/**
 * What is booked, for the agent to read out. Only after `identify` has
 * passed — an unidentified call is refused rather than answered thinly.
 *
 * The same list the candidate's own page shows: no money, nothing from the
 * scorecards. A new channel does not widen what somebody may know about
 * themselves.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const refused = notTheAgent(request);
  if (refused) return refused;

  const badId = invalidId(params.id);
  if (badId) return badId;

  try {
    return NextResponse.json(await roundsForCall(params.id), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** Hang up. Idempotent, and worth calling — it shortens the open window. */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const refused = notTheAgent(request);
  if (refused) return refused;

  const badId = invalidId(params.id);
  if (badId) return badId;

  try {
    await closeCall(params.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
