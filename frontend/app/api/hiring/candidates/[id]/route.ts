import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import {
  NeedsConfirmationError,
  decideCandidate,
  editCandidate,
  getCandidate,
  moveCandidate,
  type CandidateStatus,
} from "@/lib/services/hiring";
import { toErrorResponse } from "@/lib/api/errors";
import { invalidId } from "@/lib/api/params";

export const dynamic = "force-dynamic";

const DECISIONS: CandidateStatus[] = ["hired", "rejected", "withdrawn", "active"];

/** One candidate: their rounds, the feedback that is in, earlier applications, and the trail. */
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
 * One of three things:
 *   { stage, note? }    move them — the final stage is the offer
 *   { status, note?, confirm? }  hired, rejected, withdrawn; or `active` to
 *                       reopen. A hire that takes a seat's last place while
 *                       others are still moving comes back as a 409 asking
 *                       for `confirm: true`.
 *   { details: {…} }    correct what was typed when they were added
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
      confirm?: boolean;
      details?: {
        fullName?: string;
        email?: string | null;
        phone?: string | null;
        source?: string | null;
        currentCtc?: number | null;
        expectedCtc?: number | null;
        noticeDays?: number | null;
        resumeUrl?: string | null;
      };
    };

    const asked = [body.stage, body.status, body.details].filter((x) => x !== undefined).length;
    if (asked !== 1) {
      return NextResponse.json(
        { error: "Send one of: the stage they move to, a decision, or corrected details." },
        { status: 400 },
      );
    }

    if (body.details) {
      await editCandidate(user, params.id, body.details);
    } else if (body.stage) {
      await moveCandidate(user, params.id, body.stage, body.note ?? null);
    } else {
      if (body.status === "offered") {
        return NextResponse.json(
          { error: "An offer is made by moving the candidate to the Offer stage." },
          { status: 400 },
        );
      }
      if (!DECISIONS.includes(body.status as CandidateStatus)) {
        return NextResponse.json(
          { error: `A decision is one of: ${DECISIONS.join(", ")}.` },
          { status: 400 },
        );
      }
      await decideCandidate(user, params.id, body.status as CandidateStatus, body.note ?? null, {
        confirm: body.confirm === true,
      });
    }
    return NextResponse.json({ candidate: await getCandidate(user, params.id) });
  } catch (error) {
    if (error instanceof NeedsConfirmationError) {
      return NextResponse.json({ error: error.message, needsConfirm: true }, { status: 409 });
    }
    return toErrorResponse(error);
  }
}
