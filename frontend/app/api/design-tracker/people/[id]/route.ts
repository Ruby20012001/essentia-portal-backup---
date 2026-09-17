import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { setNotifyEmail } from "@/lib/services/design-reminders";
import { toErrorResponse } from "@/lib/api/errors";
import { invalidId } from "@/lib/api/params";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  // The address this person's reminder goes to. null / blank = their account's.
  notifyEmail: z.string().max(255).nullable(),
});

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const badId = invalidId(params.id);
  if (badId) return badId;
  try {
    const user = await getCurrentUser();
    const parsed = patchSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
    }
    await setNotifyEmail(user, params.id, parsed.data.notifyEmail);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
