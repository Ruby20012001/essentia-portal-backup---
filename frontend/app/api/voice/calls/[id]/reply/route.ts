import { NextRequest, NextResponse } from "next/server";
import { replyOnCall } from "@/lib/services/voice-agent";
import type { RoundResponse } from "@/lib/services/candidate-portal";
import { toErrorResponse } from "@/lib/api/errors";
import { invalidId } from "@/lib/api/params";
import { notTheAgent } from "@/lib/api/voice-auth";

export const dynamic = "force-dynamic";

const RESPONSES: RoundResponse[] = ["confirmed", "reschedule_requested"];

/**
 * What they said, written down — against the round, and in the trail with
 * both names on it: the machine that took it and the member of staff the
 * call was for.
 *
 * There is no endpoint here that MOVES a round, and that is the design rather
 * than an omission. The candidate asks; HR reschedules. An agent that could
 * rewrite four people's afternoons on the strength of a call authenticated by
 * a spoken name would be a bad idea wearing a good one.
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
    const body = (await request.json()) as {
      interviewId?: string;
      response?: string;
      note?: string | null;
    };

    if (!body.interviewId) {
      return NextResponse.json(
        { error: "Which round are they answering about?" },
        { status: 400 },
      );
    }
    if (!RESPONSES.includes(body.response as RoundResponse)) {
      return NextResponse.json(
        { error: `A reply is one of: ${RESPONSES.join(", ")}.` },
        { status: 400 },
      );
    }

    await replyOnCall(
      params.id,
      body.interviewId,
      body.response as RoundResponse,
      body.note ?? null,
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
