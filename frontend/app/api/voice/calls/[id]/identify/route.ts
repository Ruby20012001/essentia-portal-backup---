import { NextRequest, NextResponse } from "next/server";
import { identifyCaller } from "@/lib/services/voice-agent";
import { toErrorResponse } from "@/lib/api/errors";
import { invalidId } from "@/lib/api/params";
import { notTheAgent } from "@/lib/api/voice-auth";

export const dynamic = "force-dynamic";

/**
 * The caller has said their name. This is the gate: nothing about the
 * candidate comes back from any endpoint until this one has said ok.
 *
 * Send what the person actually said, transcription and all — the matcher
 * forgives a character per word because "Sethi" arrives as "Sethy" often
 * enough to matter. Do not clean it up, and do not send a name the agent
 * already had: the point is that it came from them.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const refused = notTheAgent(request);
  if (refused) return refused;

  const badId = invalidId(params.id);
  if (badId) return badId;

  try {
    const body = (await request.json()) as { spokenName?: string };
    if (!body.spokenName || !body.spokenName.trim()) {
      return NextResponse.json(
        { error: "Send what they said." },
        { status: 400 },
      );
    }

    const result = await identifyCaller(params.id, body.spokenName);
    return NextResponse.json(result, {
      // 200 either way. A 403 on a mismatch would let a caller tell "wrong
      // name" from "unknown number" by status code alone.
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
