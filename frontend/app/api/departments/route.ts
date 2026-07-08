import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { requirePermission } from "@/lib/services/permissions";
import { getDepartments, getDepartmentTree } from "@/lib/services/departments";
import { toErrorResponse } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    await requirePermission(user, "read", "departments");
    if (request.nextUrl.searchParams.get("tree") === "1") {
      return NextResponse.json({ departments: await getDepartmentTree() });
    }
    return NextResponse.json({ departments: await getDepartments() });
  } catch (error) {
    return toErrorResponse(error);
  }
}
