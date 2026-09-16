import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { listInterviews, scheduleInterview } from "@/lib/services/hiring";
import { toErrorResponse } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

/** Rounds. `?candidate=` for one person, `?upcoming=1` for the diary. */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    const candidateId = request.nextUrl.searchParams.get("candidate") ?? undefined;
    const upcomingOnly = request.nextUrl.searchParams.get("upcoming") === "1";
    const interviews = await listInterviews(user, { candidateId, upcomingOnly });
    return NextResponse.json({ interviews });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/**
 * A round in the diary. The panel is required and the question set is chosen
 * for the round when the caller does not name one.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    const body = (await request.json()) as {
      candidateId?: string;
      stageCode?: string;
      scheduledAt?: string;
      durationMins?: number;
      mode?: "in_person" | "video" | "phone";
      location?: string | null;
      panel?: string[];
      questionSetId?: string | null;
    };
    if (!body.candidateId || !body.stageCode || !body.scheduledAt) {
      return NextResponse.json(
        { error: "A round needs a candidate, a stage and a time." },
        { status: 400 },
      );
    }
    const interview = await scheduleInterview(user, {
      candidateId: body.candidateId,
      stageCode: body.stageCode,
      scheduledAt: body.scheduledAt,
      durationMins: body.durationMins,
      mode: body.mode,
      location: body.location ?? null,
      panel: Array.isArray(body.panel) ? body.panel : [],
      questionSetId: body.questionSetId ?? null,
    });
    return NextResponse.json(interview, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
