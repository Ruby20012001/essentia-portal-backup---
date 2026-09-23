import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import {
  emailInvite,
  prepareWhatsApp,
  type Channel,
} from "@/lib/services/candidate-contact";
import { toErrorResponse } from "@/lib/api/errors";
import { invalidId } from "@/lib/api/params";

export const dynamic = "force-dynamic";

const CHANNELS: Channel[] = ["whatsapp", "email"];

/**
 * Send one candidate their link.
 *
 * WhatsApp comes back as an address for HR's browser to open, with the number
 * and the message already in it — the portal never touches WhatsApp and never
 * claims to have sent anything. Email really is sent, by the server, so the
 * token never reaches HR's screen.
 *
 * no-store on both: a fresh invite is minted here, and the WhatsApp reply
 * carries it in the URL it hands back.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const badId = invalidId(params.id);
  if (badId) return badId;

  try {
    const body = (await request.json()) as { channel?: string };
    if (!CHANNELS.includes(body.channel as Channel)) {
      return NextResponse.json(
        { error: `Send by one of: ${CHANNELS.join(", ")}.` },
        { status: 400 },
      );
    }

    const user = await getCurrentUser();
    const prepared =
      body.channel === "whatsapp"
        ? await prepareWhatsApp(user, params.id)
        : await emailInvite(user, params.id);

    return NextResponse.json(
      { prepared },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}
