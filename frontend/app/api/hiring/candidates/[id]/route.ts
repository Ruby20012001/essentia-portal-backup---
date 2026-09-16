import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import {
  decideCandidate,
  getCandidate,
  moveCandidate,
  type CandidateStatus,
} from "@/lib/services/hiring";
import { toErrorResponse } from "@/lib/api/errors";
import { invalidId } from "@/lib/api/params";

export const dynamic = "force-dynamic";

const STATUSES: CandidateStatus[] = [
  "active",
  "offered",
  "hired",
  "rejected",
  "withdrawn",
];

/** One candidate: their rounds, the feedback that is in, and the trail. */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const badId = invalidId(params.id);
  if (badId) return badId;
  try {
    const user = await getCurrentUser();
    return NextResponse.json({ candidate: await getCandidate(user, params.id) });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/**
 * Move somebody on, or stop them. Two different things in one request shape
 * because they are the same sentence from the board's point of view: this
 * person is now here.
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
      stage?: string;
      status?: string;
      note?: string | null;
    };

    if (!body.stage && !body.status) {
      return NextResponse.json(
        { error: "Say either which stage they move to, or where they stopped." },
        { status: 400 },
      );
    }
    if (body.status && !STATUSES.includes(body.status as CandidateStatus)) {
      return NextResponse.json(
        { error: `A candidate is one of: ${STATUSES.join(", ")}.` },
        { status: 400 },
      );
    }

    if (body.stage) {
      await moveCandidate(user, params.id, body.stage, body.note ?? null);
    }
    if (body.status) {
      await decideCandidate(
        user,
        params.id,
        body.status as CandidateStatus,
        body.note ?? null,
      );
    }
    return NextResponse.json({ candidate: await getCandidate(user, params.id) });
  } catch (error) {
    return toErrorResponse(error);
  }
}
