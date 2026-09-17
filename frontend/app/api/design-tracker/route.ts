import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getDesignBoard } from "@/lib/services/design-tracker";
import { toErrorResponse } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

/** The whole Design Activity Tracker in one read, already narrowed to what this viewer may see. */
export async function GET() {
  try {
    const user = await getCurrentUser();
    return NextResponse.json(await getDesignBoard(user));
  } catch (error) {
    return toErrorResponse(error);
  }
}
