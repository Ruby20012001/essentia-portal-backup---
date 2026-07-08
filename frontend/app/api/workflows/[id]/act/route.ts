import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { actOnWorkflow } from "@/lib/services/workflows";
import { toErrorResponse } from "@/lib/api/errors";
import { invalidId } from "@/lib/api/params";

export const dynamic = "force-dynamic";

const actSchema = z.object({
  action: z.enum(["approve", "reject"]),
  comments: z.string().max(2000).optional(),
});

/**
 * Generic approval action — used by every chain (PIO today, WOs and letters
 * tomorrow). The engine enforces exact-approver identity; an unresolved
 * approver (pre-Keka mapping) is refused with the intended person named.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const badId = invalidId(params.id);
  if (badId) return badId;
  try {
    const user = await getCurrentUser();
    const parsed = actSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const instance = await actOnWorkflow(
      user,
      params.id,
      parsed.data.action,
      parsed.data.comments,
    );
    return NextResponse.json({ instance });
  } catch (error) {
    return toErrorResponse(error);
  }
}
