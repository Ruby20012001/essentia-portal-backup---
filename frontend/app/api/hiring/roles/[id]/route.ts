import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import {
  NeedsConfirmationError,
  setRoleStatus,
  updateRole,
  type EmploymentType,
  type RoleStatus,
} from "@/lib/services/hiring";
import { toErrorResponse } from "@/lib/api/errors";
import { invalidId } from "@/lib/api/params";

export const dynamic = "force-dynamic";

const STATUSES: RoleStatus[] = ["open", "on_hold", "filled", "closed"];

/**
 * Two things, one request shape. `{ status }` holds, fills, closes or reopens
 * a seat — `confirm: true` says yes when people are still moving on it.
 * Anything else is a correction to the seat itself. Nothing about a seat is
 * deleted.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const badId = invalidId(params.id);
  if (badId) return badId;
  try {
    const user = await getCurrentUser();
    const body = (await request.json()) as {
      status?: string;
      confirm?: boolean;
      title?: string;
      departmentId?: string | null;
      headcount?: number;
      location?: string | null;
      employment?: EmploymentType;
      hiringLead?: string | null;
      notes?: string | null;
    };

    if (body.status !== undefined) {
      if (!STATUSES.includes(body.status as RoleStatus)) {
        return NextResponse.json(
          { error: `A seat is one of: ${STATUSES.join(", ")}.` },
          { status: 400 },
        );
      }
      await setRoleStatus(user, params.id, body.status as RoleStatus, {
        confirm: body.confirm === true,
      });
      return NextResponse.json({ ok: true });
    }

    await updateRole(user, params.id, {
      title: body.title ?? "",
      departmentId: body.departmentId ?? null,
      headcount: body.headcount,
      location: body.location ?? null,
      employment: body.employment,
      hiringLead: body.hiringLead ?? null,
      notes: body.notes ?? null,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof NeedsConfirmationError) {
      return NextResponse.json({ error: error.message, needsConfirm: true }, { status: 409 });
    }
    return toErrorResponse(error);
  }
}
