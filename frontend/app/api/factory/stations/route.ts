import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { requirePermission } from "@/lib/services/permissions";
import { getStations } from "@/lib/services/factory";
import { toErrorResponse } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getCurrentUser();
    await requirePermission(user, "read", "factory");
    return NextResponse.json({ stations: await getStations() });
  } catch (error) {
    return toErrorResponse(error);
  }
}
