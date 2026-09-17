import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { updateChartActivity } from "@/lib/services/design-tracker";
import { toErrorResponse } from "@/lib/api/errors";
import { invalidId } from "@/lib/api/params";

export const dynamic = "force-dynamic";

const patchSchema = z
  .object({
    dueDay: z.number().int().min(0).max(2000).nullable().optional(),
    standardDays: z.number().int().min(0).max(2000).nullable().optional(),
    dependsOn: z.string().min(1).max(300).optional(),
    dependsOnClient: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "Provide at least one field" });

/** Retune one activity in the chart — its due day, its days, whom it depends on. */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
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
    await updateChartActivity(user, params.id, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
