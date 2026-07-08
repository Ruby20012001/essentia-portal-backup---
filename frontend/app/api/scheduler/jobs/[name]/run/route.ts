import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { runJobManually } from "@/lib/services/scheduler";
import { toErrorResponse } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

/** Manually run a single registered job now (admin action, trigger='manual'). */
export async function POST(
  _request: Request,
  { params }: { params: { name: string } },
) {
  try {
    const user = await getCurrentUser();
    return NextResponse.json(await runJobManually(user, params.name));
  } catch (error) {
    return toErrorResponse(error);
  }
}
