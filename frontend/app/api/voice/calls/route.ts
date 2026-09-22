import { NextRequest, NextResponse } from "next/server";
import { startCall } from "@/lib/services/voice-agent";
import { toErrorResponse } from "@/lib/api/errors";
import { notTheAgent } from "@/lib/api/voice-auth";

export const dynamic = "force-dynamic";

/**
 * Open a call.
 *
 * Gives back a call id and the sentence the agent should open with — which
 * names the member of staff the call is for, and says it is an assistant. The
 * disclosure lives here rather than in the agent's prompt so that changing it
 * is a code change with a reviewer, not a prompt edit.
 *
 * It tells you nothing about the number. An unknown one gets a call id
 * exactly like a known one; otherwise this endpoint is a way to test phone
 * numbers against our candidate list, one at a time.
 */
export async function POST(request: NextRequest) {
  const refused = notTheAgent(request);
  if (refused) return refused;

  try {
    const body = (await request.json()) as {
      phone?: string;
      direction?: string;
      onBehalfOf?: string;
    };

    if (!body.phone) {
      return NextResponse.json({ error: "Which number?" }, { status: 400 });
    }
    if (!body.onBehalfOf) {
      return NextResponse.json(
        {
          error:
            "Say whose behalf this call is on — the email of the member of " +
            "staff it is for. A call with nobody's name on it is a call " +
            "nobody can be asked about afterwards.",
        },
        { status: 400 },
      );
    }

    const started = await startCall({
      phone: body.phone,
      direction: body.direction === "inbound" ? "inbound" : "outbound",
      onBehalfOf: body.onBehalfOf,
    });
    return NextResponse.json(started, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
