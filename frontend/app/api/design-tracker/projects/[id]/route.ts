import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { deleteDesignProject, updateDesignProject } from "@/lib/services/design-tracker";
import { toErrorResponse } from "@/lib/api/errors";
import { invalidId } from "@/lib/api/params";

export const dynamic = "force-dynamic";

const dateField = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a calendar date (YYYY-MM-DD)")
  .nullable();

const patchSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    client: z.string().max(200).nullable().optional(),
    location: z.string().max(200).nullable().optional(),
    designerId: z.string().uuid().optional(),
    typeCode: z.string().min(1).max(30).nullable().optional(),
    startDate: dateField.optional(),
    completedOn: dateField.optional(),
    notes: z.string().max(2000).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "Provide at least one field" });

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
    await updateDesignProject(user, params.id, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const badId = invalidId(params.id);
  if (badId) return badId;
  try {
    const user = await getCurrentUser();
    await deleteDesignProject(user, params.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
