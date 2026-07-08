import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { createWio, listWioHistory, listWios } from "@/lib/services/wio";
import { toErrorResponse } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    // ?view=history returns every status (incl. converted / cancelled),
    // searchable by number — cancellation never deletes business records.
    if (request.nextUrl.searchParams.get("view") === "history") {
      const search = request.nextUrl.searchParams.get("q") ?? undefined;
      return NextResponse.json({ wios: await listWioHistory(user, search) });
    }
    return NextResponse.json({ wios: await listWios(user) });
  } catch (error) {
    return toErrorResponse(error);
  }
}

const createWioSchema = z.object({
  projectId: z.string().uuid(),
  departmentCode: z.string().min(2).max(20),
  notes: z.string().max(2000).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    const parsed = createWioSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const wio = await createWio(user, parsed.data);
    return NextResponse.json({ wio }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
