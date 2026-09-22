import { NextRequest, NextResponse } from "next/server";
import {
  MAX_DOCUMENT_BYTES,
  uploadDocument,
  type CandidateDocument,
} from "@/lib/services/candidate-portal";
import { toErrorResponse } from "@/lib/api/errors";
import { clientIp } from "@/lib/api/request";

export const dynamic = "force-dynamic";

const KINDS: CandidateDocument["kind"][] = ["resume", "portfolio", "other"];

/**
 * The candidate sending their CV.
 *
 * The size is checked here as well as in the service. Reading a 400 MB body
 * into memory to then refuse it is the refusal costing more than the attack,
 * so the length is taken from the form field before the bytes are kept — and
 * the service checks again, because a Content-Length is whatever the client
 * decided to write.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { token: string } },
) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    const kindRaw = String(form.get("kind") ?? "resume");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file came through." }, { status: 400 });
    }
    if (file.size > MAX_DOCUMENT_BYTES) {
      return NextResponse.json(
        {
          error: `That file is larger than ${Math.round(
            MAX_DOCUMENT_BYTES / (1024 * 1024),
          )} MB.`,
        },
        { status: 413 },
      );
    }
    const kind = KINDS.includes(kindRaw as CandidateDocument["kind"])
      ? (kindRaw as CandidateDocument["kind"])
      : "resume";

    await uploadDocument(
      params.token,
      {
        filename: file.name,
        mime: file.type,
        bytes: Buffer.from(await file.arrayBuffer()),
      },
      kind,
      clientIp(request),
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
