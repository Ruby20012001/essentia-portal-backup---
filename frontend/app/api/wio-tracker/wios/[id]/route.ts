import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { deleteTrackerWio, updateTrackerWio } from "@/lib/services/wio-tracker";
import { toErrorResponse } from "@/lib/api/errors";
import { invalidId } from "@/lib/api/params";

export const dynamic = "force-dynamic";

const dateField = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a calendar date (YYYY-MM-DD)")
  .nullable();

const patchSchema = z
  .object({
    project: z.string().max(200).nullable().optional(),
    scope: z.string().max(2000).nullable().optional(),
    raisedBy: z.string().max(120).nullable().optional(),
    wioIssued: dateField.optional(),
    stageId: z.string().uuid().optional(),
    // Omit this alongside stageId and the service re-stamps it to the board's
    // stamped date. Send it to override — a correction, not the normal path.
    since: dateField.optional(),
    notes: z.string().max(2000).nullable().optional(),
    pioReleased: dateField.optional(),
    pioNo: z.string().max(40).nullable().optional(),
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
    await updateTrackerWio(user, params.id, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const badId = invalidId(params.id);
  if (badId) return badId;
  try {
    const user = await getCurrentUser();
    await deleteTrackerWio(user, params.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
