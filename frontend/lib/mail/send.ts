/**
 * Sending email, via Brevo's HTTP API.
 *
 * Chosen over SMTP deliberately. SMTP would mean either a dependency
 * (nodemailer) or writing the protocol by hand over a TLS socket — EHLO, AUTH,
 * MAIL FROM, RCPT, DATA — for the sake of sending one short message. This is a
 * POST with fetch, which Node already has, and it fails with a readable reason
 * instead of a socket timeout.
 *
 * NOT CONFIGURED IS A FIRST-CLASS ANSWER. The portal ran for months with an
 * email channel that rendered messages and could not send them
 * (lib/notifications/channels/email.ts). Anything calling this must be able to
 * tell "we sent it" from "there is nowhere to send it from" and say so — a
 * sign-in screen that claims to have sent a code it never sent is worse than
 * one with no code at all.
 */

export type MailResult =
  | { ok: true }
  | { ok: false; reason: "not_configured" | "rejected"; detail: string };

export function mailConfigured(): boolean {
  return Boolean(process.env.BREVO_API_KEY && process.env.MAIL_FROM);
}

export async function sendMail(input: {
  to: string;
  toName?: string;
  subject: string;
  text: string;
  html: string;
}): Promise<MailResult> {
  const key = process.env.BREVO_API_KEY;
  const from = process.env.MAIL_FROM;

  if (!key || !from) {
    return {
      ok: false,
      reason: "not_configured",
      detail:
        "Email is not switched on for this deployment (BREVO_API_KEY / MAIL_FROM).",
    };
  }

  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": key,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        sender: { email: from, name: process.env.MAIL_FROM_NAME ?? "essentia portal" },
        to: [{ email: input.to, ...(input.toName ? { name: input.toName } : {}) }],
        subject: input.subject,
        textContent: input.text,
        htmlContent: input.html,
      }),
      // A sign-in screen is waiting on this. Better a clear failure in ten
      // seconds than a spinner that never resolves.
      signal: AbortSignal.timeout(10_000),
    });

    if (res.ok) return { ok: true };

    // Brevo says why — an unverified sender, a key that has been revoked, a
    // daily cap. Carried through so the cause reaches whoever can fix it,
    // rather than being flattened into "could not send".
    const body = await res.text().catch(() => "");
    return {
      ok: false,
      reason: "rejected",
      detail: `Brevo refused the message (${res.status}). ${body.slice(0, 300)}`,
    };
  } catch (error) {
    return {
      ok: false,
      reason: "rejected",
      detail: error instanceof Error ? error.message : "The mail service did not answer.",
    };
  }
}
