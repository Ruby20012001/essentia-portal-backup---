import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { boardVisitor, deleteProject3d, updateProject3d } from "@/lib/services/team-weekly";
import { toErrorResponse } from "@/lib/api/errors";
import { invalidId } from "@/lib/api/params";

export const dynamic = "force-dynamic";

const patchSchema = z
  .object({
    stage: z.enum(["ongoing", "revisions", "signoff"]).optional(),
    name: z.string().max(200).optional(),
    client: z.string().max(200).nullable().optional(),
    notes: z.string().max(4000).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "Provide at least one field" });

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const badId = invalidId(params.id);
  if (badId) return badId;
  try {
    const user = await boardVisitor();
    const parsed = patchSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    await updateProject3d(user, params.id, parsed.data);
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
    const user = await boardVisitor();
    await deleteProject3d(user, params.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
