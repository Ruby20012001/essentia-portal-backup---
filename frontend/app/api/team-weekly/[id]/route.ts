import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { boardVisitor, deleteWeeklyEntries, updateWeeklyEntry } from "@/lib/services/team-weekly";
import { toErrorResponse } from "@/lib/api/errors";
import { invalidId } from "@/lib/api/params";

export const dynamic = "force-dynamic";

/** A status move, or an Edit of any of the entry's details. */
const patchSchema = z
  .object({
    team: z.string().min(1).max(80).optional(),
    workType: z.string().min(1).max(80).optional(),
    title: z.string().trim().min(1, "Say what was done").max(2000).optional(),
    qty: z.number().int().min(1).max(999).optional(),
    workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a calendar date (YYYY-MM-DD)").optional(),
    status: z.enum(["done", "progress", "pending"]).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Provide at least one field" });

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
    await updateWeeklyEntry(user, params.id, parsed.data);
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
    await deleteWeeklyEntries(user, [params.id]);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
