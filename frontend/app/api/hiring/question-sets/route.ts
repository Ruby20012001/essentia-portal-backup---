import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { createQuestionSet, listQuestionSets } from "@/lib/services/hiring";
import { toErrorResponse } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

/** The question bank. */
export async function GET() {
  try {
    const user = await getCurrentUser();
    return NextResponse.json({ sets: await listQuestionSets(user) });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** A set of questions a round will ask, in the order they are given. */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    const body = (await request.json()) as {
      name?: string;
      stageCode?: string | null;
      roleId?: string | null;
      questions?: { prompt: string; guidance?: string | null }[];
    };
    const set = await createQuestionSet(user, {
      name: body.name ?? "",
      stageCode: body.stageCode ?? null,
      roleId: body.roleId ?? null,
      questions: Array.isArray(body.questions) ? body.questions : [],
    });
    return NextResponse.json(set, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
