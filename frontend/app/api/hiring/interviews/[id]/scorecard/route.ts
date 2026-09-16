import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { saveScorecard, type Scorecard } from "@/lib/services/hiring";
import { toErrorResponse } from "@/lib/api/errors";
import { invalidId } from "@/lib/api/params";

export const dynamic = "force-dynamic";

const CALLS: NonNullable<Scorecard["recommendation"]>[] = [
  "strong_yes",
  "yes",
  "no",
  "strong_no",
];

/**
 * Your own feedback on a round you sat in. Saving without `submit` keeps it a
 * draft; submitting is one way, and there is no route that edits it after.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const badId = invalidId(params.id);
  if (badId) return badId;
  try {
    const user = await getCurrentUser();
    const body = (await request.json()) as {
      recommendation?: string | null;
      strengths?: string | null;
      concerns?: string | null;
      answers?: { questionId: string; rating?: number | null; notes?: string | null }[];
      submit?: boolean;
    };
    if (
      body.recommendation &&
      !CALLS.includes(body.recommendation as NonNullable<Scorecard["recommendation"]>)
    ) {
      return NextResponse.json(
        { error: `A recommendation is one of: ${CALLS.join(", ")}.` },
        { status: 400 },
      );
    }
    const saved = await saveScorecard(user, params.id, {
      recommendation:
        (body.recommendation as Scorecard["recommendation"]) ?? undefined,
      strengths: body.strengths ?? null,
      concerns: body.concerns ?? null,
      answers: Array.isArray(body.answers) ? body.answers : [],
      submit: Boolean(body.submit),
    });
    return NextResponse.json(saved);
  } catch (error) {
    return toErrorResponse(error);
  }
}
