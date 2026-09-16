import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import {
  getRoundForPanel,
  setInterviewStatus,
  type InterviewSummary,
} from "@/lib/services/hiring";
import { toErrorResponse } from "@/lib/api/errors";
import { invalidId } from "@/lib/api/params";

export const dynamic = "force-dynamic";

const STATUSES: InterviewSummary["status"][] = [
  "scheduled",
  "done",
  "cancelled",
  "no_show",
];

/**
 * The round as the person sitting in it sees it — who they are meeting, what
 * to ask, and their own scorecard. Being on the panel is the permission here,
 * not hr_access: the point of a panel is that somebody outside HR is in it.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const badId = invalidId(params.id);
  if (badId) return badId;
  try {
    const user = await getCurrentUser();
    return NextResponse.json(await getRoundForPanel(user, params.id));
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** Held, happened, called off, or nobody came. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const badId = invalidId(params.id);
  if (badId) return badId;
  try {
    const user = await getCurrentUser();
    const body = (await request.json()) as { status?: string };
    if (!body.status || !STATUSES.includes(body.status as InterviewSummary["status"])) {
      return NextResponse.json(
        { error: `A round is one of: ${STATUSES.join(", ")}.` },
        { status: 400 },
      );
    }
    await setInterviewStatus(
      user,
      params.id,
      body.status as InterviewSummary["status"],
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
