import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { requirePermission } from "@/lib/services/permissions";
import { listProjectOptions } from "@/lib/services/projects";
import { toErrorResponse } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getCurrentUser();
    await requirePermission(user, "read", "projects");
    return NextResponse.json({ projects: await listProjectOptions(user) });
  } catch (error) {
    return toErrorResponse(error);
  }
}
