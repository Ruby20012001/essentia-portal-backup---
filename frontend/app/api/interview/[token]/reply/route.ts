import { NextRequest, NextResponse } from "next/server";
import {
  respondToRound,
  type RoundResponse,
} from "@/lib/services/candidate-portal";
import { toErrorResponse } from "@/lib/api/errors";
import { clientIp } from "@/lib/api/request";

export const dynamic = "force-dynamic";

const RESPONSES: RoundResponse[] = ["confirmed", "reschedule_requested"];

/**
 * The candidate answering. No session, no `getCurrentUser()` — the token in
 * the path is the whole of the authentication, which is why the service
 * treats it as already leaked and the reply cannot do anything worse than
 * write a sentence against one interview.
 *
 * Note what is NOT here: no route that moves the round. The candidate asks;
 * HR decides. A page that let the person being interviewed rewrite four
 * people's afternoons would be a different and much worse page.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { token: string } },
) {
  try {
    const body = (await request.json()) as {
      interviewId?: string;
      response?: string;
      note?: string | null;
    };

    if (!body.interviewId) {
      return NextResponse.json(
        { error: "Which round are you answering about?" },
        { status: 400 },
      );
    }
    if (!RESPONSES.includes(body.response as RoundResponse)) {
      return NextResponse.json(
        { error: "Say either that you can make it, or that you cannot." },
        { status: 400 },
      );
    }

    await respondToRound(
      params.token,
      body.interviewId,
      body.response as RoundResponse,
      body.note ?? null,
      clientIp(request),
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
