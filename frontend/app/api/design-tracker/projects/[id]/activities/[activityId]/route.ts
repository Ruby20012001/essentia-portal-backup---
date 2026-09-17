import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { markProjectActivity } from "@/lib/services/design-tracker";
import { toErrorResponse } from "@/lib/api/errors";
import { invalidId } from "@/lib/api/params";

export const dynamic = "force-dynamic";

const markSchema = z
  .object({
    doneOn: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a calendar date (YYYY-MM-DD)")
      .nullable()
      .optional(),
    notApplicable: z.boolean().optional(),
    remark: z.string().max(1000).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "Provide at least one field" });

/** One activity on one project: done on a day, not applicable, or a remark. */
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string; activityId: string } },
) {
  const badId = invalidId(params.id) ?? invalidId(params.activityId);
  if (badId) return badId;
  try {
    const user = await getCurrentUser();
    const parsed = markSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    await markProjectActivity(user, params.id, params.activityId, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
