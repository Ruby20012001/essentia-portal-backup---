import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { toErrorResponse } from "@/lib/api/errors";
import { addKnowledge } from "@/lib/services/knowledge";
import { CONTENT_TYPES, TRACKS, parseTags } from "@/lib/services/knowledge-logic";

export const dynamic = "force-dynamic";

const trackNames = TRACKS.map((t) => t.name) as [string, ...string[]];
const typeKeys = CONTENT_TYPES.map((c) => c.key) as [string, ...string[]];

const schema = z.object({
  title: z.string().trim().min(3).max(300),
  content: z.string().trim().min(20).max(20_000),
  track: z.enum(trackNames),
  contentType: z.enum(typeKeys),
  roleTags: z.string().max(500).default(""),
  topicTags: z.string().max(500).default(""),
  projectTypeTags: z.string().max(500).default(""),
  year: z.coerce.number().int().min(2015).max(2100).nullable().optional(),
  sessionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

/** Add one Wednesday Year session to the library. */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Please add a title, a track, a type and session notes of at least 20 characters." },
        { status: 400 },
      );
    }
    const d = parsed.data;
    const created = await addKnowledge(user, {
      title: d.title,
      content: d.content,
      track: d.track as (typeof TRACKS)[number]["name"],
      contentType: d.contentType as (typeof CONTENT_TYPES)[number]["key"],
      roleTags: parseTags(d.roleTags),
      topicTags: parseTags(d.topicTags),
      projectTypeTags: parseTags(d.projectTypeTags),
      year: d.year ?? (d.sessionDate ? Number(d.sessionDate.slice(0, 4)) : null),
      sessionDate: d.sessionDate ?? null,
    });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
