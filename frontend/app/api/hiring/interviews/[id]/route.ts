import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import {
  excusePanelist,
  getRound,
  setInterviewStatus,
  updateInterview,
  type InterviewSummary,
} from "@/lib/services/hiring";
import { toErrorResponse } from "@/lib/api/errors";
import { invalidId } from "@/lib/api/params";

export const dynamic = "force-dynamic";

const STATUSES: InterviewSummary["status"][] = ["scheduled", "done", "cancelled", "no_show"];
const MODES: InterviewSummary["mode"][] = ["in_person", "video", "phone"];

/**
 * A round — for the people sitting in it, with their own scorecard, and for HR,
 * who can check its time, panel and questions without being on the panel.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const badId = invalidId(params.id);
  if (badId) return badId;
  try {
    const user = await getCurrentUser();
    return NextResponse.json(await getRound(user, params.id));
  } catch (error) {
    return toErrorResponse(error);
  }
}

/**
 * `{ excuse: { userId, reason } }` excuses somebody from writing it up.
 * `{ status }` marks a round held, called off or no-show (or puts it back in
 * the diary). Anything else changes a round still ahead: time, length, how,
 * where, the question set, or the panel. The people affected are told.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const badId = invalidId(params.id);
  if (badId) return badId;
  try {
    const user = await getCurrentUser();
    const body = (await request.json()) as {
      status?: string;
      scheduledAt?: string;
      durationMins?: number;
      mode?: string;
      location?: string | null;
      panel?: string[];
      questionSetId?: string | null;
      excuse?: { userId?: string; reason?: string };
    };

    if (body.excuse !== undefined) {
      await excusePanelist(user, params.id, body.excuse.userId ?? "", body.excuse.reason ?? "");
      return NextResponse.json({ ok: true });
    }

    if (body.status !== undefined) {
      if (!STATUSES.includes(body.status as InterviewSummary["status"])) {
        return NextResponse.json(
          { error: `A round is one of: ${STATUSES.join(", ")}.` },
          { status: 400 },
        );
      }
      await setInterviewStatus(user, params.id, body.status as InterviewSummary["status"]);
      return NextResponse.json({ ok: true });
    }

    if (body.mode !== undefined && !MODES.includes(body.mode as InterviewSummary["mode"])) {
      return NextResponse.json(
        { error: "A round is in person, on video or on the phone." },
        { status: 400 },
      );
    }
    await updateInterview(user, params.id, {
      scheduledAt: body.scheduledAt,
      durationMins: body.durationMins,
      mode: body.mode as InterviewSummary["mode"] | undefined,
      location: body.location,
      panel: Array.isArray(body.panel) ? body.panel : undefined,
      questionSetId: body.questionSetId,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
