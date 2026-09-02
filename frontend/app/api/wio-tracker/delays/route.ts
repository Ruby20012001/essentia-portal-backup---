import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { createDelay } from "@/lib/services/wio-tracker";
import { toErrorResponse } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

/**
 * Log why a WIO is stuck.
 *
 * `cause` and `source` are NOT accepted from the caller — the service reads
 * them off the chosen reason. That is the whole reason the reasons are rows:
 * two people logging "Client · Approval delay" must produce the same cause and
 * the same source, every time, or the delay analysis is fiction.
 */
const createSchema = z.object({
  wioId: z.string().uuid(),
  why: z.string().min(1).max(120),
  owner: z.string().max(120).nullable().optional(),
  dept: z.string().max(80).nullable().optional(),
  started: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a calendar date (YYYY-MM-DD)")
    .nullable()
    .optional(),
  remark: z.string().max(2000).nullable().optional(),
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
    const id = await createDelay(user, parsed.data);
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
