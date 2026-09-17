import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { updateDesignSettings } from "@/lib/services/design-tracker";
import { toErrorResponse } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

const patchSchema = z
  .object({
    // A date pins the board to it; null returns it to the calendar.
    today: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a calendar date (YYYY-MM-DD)")
      .nullable()
      .optional(),
    warmWithin: z.number().int().min(0).max(60).optional(),
    teamName: z.string().min(1).max(120).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "Provide at least one field" });

export async function PATCH(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    const parsed = patchSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    await updateDesignSettings(user, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
