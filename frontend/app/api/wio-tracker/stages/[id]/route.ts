import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { updateStage } from "@/lib/services/wio-tracker";
import { toErrorResponse } from "@/lib/api/errors";
import { invalidId } from "@/lib/api/params";

export const dynamic = "force-dynamic";

/**
 * Retune one stage of the chain — who holds it, and how many days before the
 * PIO date it must clear. This is a policy change, not a daily edit: it moves
 * the LATE HERE line for every WIO sitting at that stage at once.
 */
const patchSchema = z
  .object({
    waitingOn: z.string().min(1).max(120).optional(),
    doneBy: z.number().int().min(0).max(365).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one field",
  });

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const badId = invalidId(params.id);
  if (badId) return badId;
  try {
    const user = await getCurrentUser();
    const parsed = patchSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    await updateStage(user, params.id, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
