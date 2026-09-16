import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import {
  addCandidate,
  hiringRights,
  listCandidates,
  listStages,
} from "@/lib/services/hiring";
import { toErrorResponse } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

/** The board. `?role=` narrows to one seat, `?all=1` includes people who stopped. */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    const roleId = request.nextUrl.searchParams.get("role");
    const includeClosed = request.nextUrl.searchParams.get("all") === "1";
    const [candidates, stages, rights] = await Promise.all([
      listCandidates(user, { roleId, includeClosed }),
      listStages(),
      hiringRights(user),
    ]);
    return NextResponse.json({ candidates, stages, rights });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** Somebody new against a seat. */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    const body = (await request.json()) as {
      roleId?: string;
      fullName?: string;
      email?: string | null;
      phone?: string | null;
      source?: string | null;
      currentCtc?: number | null;
      expectedCtc?: number | null;
      noticeDays?: number | null;
      resumeUrl?: string | null;
    };
    if (!body.roleId) {
      return NextResponse.json(
        { error: "A candidate is always against a seat — name which one." },
        { status: 400 },
      );
    }
    const candidate = await addCandidate(user, {
      roleId: body.roleId,
      fullName: body.fullName ?? "",
      email: body.email ?? null,
      phone: body.phone ?? null,
      source: body.source ?? null,
      currentCtc: body.currentCtc ?? null,
      expectedCtc: body.expectedCtc ?? null,
      noticeDays: body.noticeDays ?? null,
      resumeUrl: body.resumeUrl ?? null,
    });
    return NextResponse.json(candidate, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
