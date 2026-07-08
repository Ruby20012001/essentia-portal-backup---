import { NextResponse } from "next/server";
import { z } from "zod";

const uuidSchema = z.string().uuid();

/** Rejects malformed route ids with a 400 before they reach SQL. */
export function invalidId(id: string): NextResponse | null {
  if (uuidSchema.safeParse(id).success) return null;
  return NextResponse.json(
    { error: "Invalid id — must be a UUID" },
    { status: 400 },
  );
}
