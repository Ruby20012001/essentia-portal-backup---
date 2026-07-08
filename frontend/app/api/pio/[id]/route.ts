import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { updateTriangle } from "@/lib/services/pio";
import { toErrorResponse } from "@/lib/api/errors";
import { invalidId } from "@/lib/api/params";

export const dynamic = "force-dynamic";

const patchPioSchema = z
  .object({
    finalBoqSigned: z.boolean().optional(),
    final3dSigned: z.boolean().optional(),
    gfcSignedByClient: z.boolean().optional(),
    bomShared: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one Triangle field",
  });

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const badId = invalidId(params.id);
  if (badId) return badId;
  try {
    const user = await getCurrentUser();
    const parsed = patchPioSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const pio = await updateTriangle(user, params.id, parsed.data);
    return NextResponse.json({ pio });
  } catch (error) {
    return toErrorResponse(error);
  }
}
