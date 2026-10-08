import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { ALL_FIELDS, deleteStageRow, updateStageRow } from "@/lib/services/stage-tracker";
import { toErrorResponse } from "@/lib/api/errors";
import { invalidId } from "@/lib/api/params";

export const dynamic = "force-dynamic";

const text = z.string().max(2000).nullable().optional();
const patchSchema = z
  .object({
    project: z.string().max(200).optional(),
    ...Object.fromEntries(ALL_FIELDS.map((f) => [f, f === "member" ? z.string().max(120).nullable().optional() : text])),
  })
  .strict();

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
    await updateStageRow(user, params.id, parsed.data as Record<string, string | null>);
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
    await deleteStageRow(user, params.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
