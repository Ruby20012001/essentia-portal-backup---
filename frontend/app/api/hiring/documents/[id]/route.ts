import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { readDocument } from "@/lib/services/candidate-portal";
import { toErrorResponse } from "@/lib/api/errors";
import { invalidId } from "@/lib/api/params";

export const dynamic = "force-dynamic";

/**
 * A candidate's CV, for HR and for the panel about to meet them.
 *
 * There is no permission check in this handler and that is deliberate: the
 * fence is db/056's policy, applied under the reader's own context inside
 * `readDocument`. Somebody on no panel and outside HR gets no row, so the
 * answer here is a 404 — not a 403, which would confirm the file exists.
 *
 * ALWAYS AN ATTACHMENT, NEVER INLINE. These bytes came from outside the
 * company through a page with no login on it. `Content-Disposition:
 * attachment` plus `X-Content-Type-Options: nosniff` means the browser hands
 * the file to Word rather than deciding for itself that it looks like
 * something worth rendering on this origin.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const badId = invalidId(params.id);
  if (badId) return badId;
  try {
    const user = await getCurrentUser();
    const doc = await readDocument(user, params.id);
    if (!doc) {
      return NextResponse.json({ error: "No such document." }, { status: 404 });
    }

    // The filename is the candidate's own text. Quotes and control characters
    // come out of it before it goes into a header, or the header is theirs to
    // write rather than ours.
    const safeName = doc.filename.replace(/["\\\r\n]/g, "").slice(0, 200);

    return new NextResponse(new Uint8Array(doc.bytes), {
      headers: {
        "Content-Type": doc.mime,
        "Content-Disposition": `attachment; filename="${safeName}"`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
