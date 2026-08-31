import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { createTrackerWio } from "@/lib/services/wio-tracker";
import { toErrorResponse } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

/** Calendar date, or explicitly cleared. Never a timestamp — the board is days. */
const dateField = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a calendar date (YYYY-MM-DD)")
  .nullable();

const createSchema = z.object({
  wio: z.string().min(1).max(40),
  project: z.string().max(200).nullable().optional(),
  scope: z.string().max(2000).nullable().optional(),
  raisedBy: z.string().max(120).nullable().optional(),
  // Optional on purpose: a WIO with no issue date is a real state the board
  // reports as "Not tracked". Requiring it here would push people to invent one.
  wioIssued: dateField.optional(),
  stageId: z.string().uuid(),
  since: dateField.optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    const parsed = createSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const id = await createTrackerWio(user, parsed.data);
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
