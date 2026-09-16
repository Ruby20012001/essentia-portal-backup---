import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { hiringRights, listOpenRoles, openRole } from "@/lib/services/hiring";
import { toErrorResponse } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

/** Every seat, open or otherwise, with how many people are against it. */
export async function GET() {
  try {
    const user = await getCurrentUser();
    const [roles, rights] = await Promise.all([
      listOpenRoles(user),
      hiringRights(user),
    ]);
    return NextResponse.json({ roles, rights });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** A new seat. */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    const body = (await request.json()) as {
      title?: string;
      departmentId?: string | null;
      headcount?: number;
      location?: string | null;
      employment?: "full_time" | "contract" | "intern";
      hiringLead?: string | null;
      notes?: string | null;
    };
    const role = await openRole(user, {
      title: body.title ?? "",
      departmentId: body.departmentId ?? null,
      headcount: body.headcount,
      location: body.location ?? null,
      employment: body.employment,
      hiringLead: body.hiringLead ?? null,
      notes: body.notes ?? null,
    });
    return NextResponse.json(role, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
