import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { updateWio } from "@/lib/services/wio";
import { toErrorResponse } from "@/lib/api/errors";
import { invalidId } from "@/lib/api/params";

export const dynamic = "force-dynamic";

const patchWioSchema = z
  .object({
    boqApproved: z.boolean().optional(),
    design3dApproved: z.boolean().optional(),
    sldApproved: z.boolean().optional(),
    status: z.enum(["initiated", "in_progress", "on_hold", "cancelled"]).optional(),
    notes: z.string().max(2000).optional(),
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
    const parsed = patchWioSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const wio = await updateWio(user, params.id, parsed.data);
    return NextResponse.json({ wio });
  } catch (error) {
    return toErrorResponse(error);
  }
}
