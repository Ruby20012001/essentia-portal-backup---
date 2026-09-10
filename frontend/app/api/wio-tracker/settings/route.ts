import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { updateSettings } from "@/lib/services/wio-tracker";
import { toErrorResponse } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

/**
 * Re-stamp the board's date, or retune the window.
 *
 * `today` is the shared reading date, not the wall clock. One row, one value,
 * everybody sees the same numbers — including in a screenshot taken at 11pm.
 */
const patchSchema = z
  .object({
    today: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a calendar date (YYYY-MM-DD)")
      .optional(),
    windowDays: z.number().int().min(1).max(365).optional(),
    atRiskFrom: z.number().int().min(0).max(365).optional(),
    teamName: z.string().min(1).max(120).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one field",
  });

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
    await updateSettings(user, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
