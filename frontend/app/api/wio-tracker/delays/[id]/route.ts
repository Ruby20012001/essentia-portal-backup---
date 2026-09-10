import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { updateDelay } from "@/lib/services/wio-tracker";
import { toErrorResponse } from "@/lib/api/errors";
import { invalidId } from "@/lib/api/params";

export const dynamic = "force-dynamic";

const patchSchema = z
  .object({
    // Closing without an end date stamps one automatically — an open-ended
    // "Closed" would keep accruing days_lost forever.
    status: z.enum(["Open", "Closed"]).optional(),
    ended: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a calendar date (YYYY-MM-DD)")
      .nullable()
      .optional(),
    owner: z.string().max(120).nullable().optional(),
    dept: z.string().max(80).nullable().optional(),
    remark: z.string().max(2000).nullable().optional(),
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
    await updateDelay(user, params.id, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
