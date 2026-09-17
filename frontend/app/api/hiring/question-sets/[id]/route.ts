import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { updateQuestionSet } from "@/lib/services/hiring";
import { toErrorResponse } from "@/lib/api/errors";
import { invalidId } from "@/lib/api/params";

export const dynamic = "force-dynamic";

/**
 * `{ isActive }` retires or restores a set — always allowed. A name, stage,
 * seat or question list rewrites it, which is refused once any round uses it.
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
      isActive?: boolean;
      name?: string;
      stageCode?: string | null;
      roleId?: string | null;
      questions?: { prompt: string; guidance?: string | null }[];
    };
    if (body.isActive !== undefined && typeof body.isActive !== "boolean") {
      return NextResponse.json({ error: "isActive is true or false." }, { status: 400 });
    }
    await updateQuestionSet(user, params.id, {
      isActive: body.isActive,
      name: body.name,
      stageCode: body.stageCode,
      roleId: body.roleId,
      questions: Array.isArray(body.questions) ? body.questions : undefined,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
