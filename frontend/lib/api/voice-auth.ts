import { NextRequest, NextResponse } from "next/server";
import { clientIp } from "@/lib/api/request";
import { agentAuthenticated } from "@/lib/services/voice-agent";

/**
 * The guard on every voice endpoint.
 *
 * Returns a response to send when the caller is not the agent, or null when
 * it is. Written as "return the refusal" rather than "throw" so that every
 * route has to put the check on its first line and a reviewer can see it
 * there.
 *
 * No `WWW-Authenticate` header and no detail in the body: this is a machine
 * endpoint, and the only caller that should ever see a 401 is one that has
 * no business knowing what it got wrong.
 */
export function notTheAgent(request: NextRequest): NextResponse | null {
  if (!fromAnAllowedAddress(request)) {
    return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  }

  const presented =
    request.headers.get("x-agent-key") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    null;

  if (agentAuthenticated(presented)) return null;
  return NextResponse.json({ error: "Not authorised." }, { status: 401 });
}

/**
 * The second lock, for when the voice provider is known.
 *
 * Connecting Vapi (or anyone else) means our key lives in somebody else's
 * dashboard and these endpoints face the open internet. The key is still the
 * thing that authenticates — this only narrows WHERE it may be presented
 * from, so a leaked key is not on its own enough.
 *
 * UNSET MEANS OFF, and that is the right default here — the opposite of
 * `VOICE_AGENT_API_KEY`, and worth being clear about why they differ. An
 * unset key means no agent is configured, so refusing everything costs
 * nothing. An unset allowlist means nobody has told us which addresses the
 * provider calls from, and guessing would lock out the agent that is
 * legitimately working. So: no list, no restriction; the key still stands.
 *
 * `VOICE_AGENT_ALLOWED_IPS` is a comma-separated list of exact addresses.
 * Deliberately not CIDR: a range is easy to write too wide by accident, and
 * providers publish specific egress addresses.
 *
 * The address comes from `x-forwarded-for`, which a client can send. Behind
 * Vercel the platform overwrites it, so the leftmost entry is trustworthy
 * there — but that is a property of the deployment, not of this code. Do not
 * put this in front of anything without a proxy that normalises the header.
 */
function fromAnAllowedAddress(request: NextRequest): boolean {
  const configured = process.env.VOICE_AGENT_ALLOWED_IPS;
  if (!configured || !configured.trim()) return true;

  const allowed = configured
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (allowed.length === 0) return true;

  const ip = clientIp(request);
  if (!ip) return false;
  return allowed.includes(ip);
}
