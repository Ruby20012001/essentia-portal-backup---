import { createHash, randomInt } from "node:crypto";
import { query } from "@/lib/db";
import { sendMail, mailConfigured } from "@/lib/mail/send";
import { writeAudit } from "@/lib/services/audit";

/**
 * Signing in with a code sent by email.
 *
 * The point is not convenience. A password is a thing people forget, write
 * down, and share; a code proves the person is holding the mailbox the account
 * belongs to, which is the question a login is actually asking. It also retires
 * "forgot password" — someone who cannot remember theirs signs in with a code
 * and sets a new one.
 *
 * WHAT NEVER LEAVES THIS FILE. The code is generated, hashed, stored as the
 * hash, and sent. Nothing else can read it back, including the audit trail.
 *
 * WHAT A CALLER IS TOLD. Whether the account exists is never revealed — a
 * request for an unknown address returns the same "sent" as a real one, and
 * simply sends nothing. Otherwise this endpoint becomes a way to find out who
 * works here, one address at a time.
 *
 * The one exception is email being switched off, which is not a secret and is
 * reported plainly: a screen that says "code sent" when there is nowhere to
 * send from would have people waiting on a message that cannot arrive.
 */

const CODE_MINUTES = 10;
const MAX_ATTEMPTS = 5;

const hash = (code: string) => createHash("sha256").update(code).digest("hex");

/** Six digits, from the CSPRNG — Math.random is guessable from its own output. */
function newCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export type RequestResult =
  | { ok: true }
  | { ok: false; error: string };

export async function requestSignInCode(
  emailRaw: string,
  ip: string | null,
): Promise<RequestResult> {
  const email = emailRaw.trim().toLowerCase();

  if (!mailConfigured()) {
    return {
      ok: false,
      error:
        "Sign-in codes are not switched on for this deployment yet. Use your password, or ask your team lead to reset it.",
    };
  }

  const [account] = await query<{ id: string; full_name: string; email: string }>(
    `SELECT id, full_name, email FROM public.users
      WHERE lower(email) = $1 AND is_active AND auth_provider = 'local'`,
    [email],
  );

  // No account, or a Microsoft account: say the same thing, send nothing.
  if (!account) {
    await writeAudit({
      action: "SIGNIN_CODE_REQUESTED_UNKNOWN",
      resourceType: "login_codes",
      newValues: { email },
    });
    return { ok: true };
  }

  // One live code at a time. Asking twice replaces, never accumulates.
  await query(
    `UPDATE portal.login_codes SET revoked_at = NOW()
      WHERE lower(email) = $1 AND consumed_at IS NULL AND revoked_at IS NULL`,
    [email],
  );

  const code = newCode();
  await query(
    `INSERT INTO portal.login_codes (email, code_hash, max_attempts, expires_at, ip_address)
     VALUES ($1, $2, $3, NOW() + ($4 || ' minutes')::interval, $5)`,
    [email, hash(code), MAX_ATTEMPTS, String(CODE_MINUTES), ip],
  );

  const sent = await sendMail({
    to: account.email,
    toName: account.full_name,
    subject: `${code} is your essentia portal code`,
    text:
      `${code}\n\n` +
      `This code signs you in to the essentia portal. It works once and expires in ${CODE_MINUTES} minutes.\n\n` +
      `If you did not ask for it, you can ignore this — nobody can use it without your mailbox.`,
    html:
      `<div style="font-family:Helvetica,Arial,sans-serif;color:#111">` +
      `<p style="font-size:13px;color:#555;margin:0 0 18px">essentia portal</p>` +
      `<p style="font-size:34px;letter-spacing:8px;font-weight:700;margin:0 0 18px">${code}</p>` +
      `<p style="font-size:13px;line-height:1.6;margin:0 0 8px">This code signs you in. It works once and expires in ${CODE_MINUTES} minutes.</p>` +
      `<p style="font-size:12px;line-height:1.6;color:#777;margin:0">If you did not ask for it, ignore this — nobody can use it without your mailbox.</p>` +
      `</div>`,
  });

  if (!sent.ok) {
    // The code exists but never reached anybody; leaving it live would be a
    // credential nobody can use and an attacker can still guess at.
    await query(
      `UPDATE portal.login_codes SET revoked_at = NOW()
        WHERE lower(email) = $1 AND consumed_at IS NULL AND revoked_at IS NULL`,
      [email],
    );
    return {
      ok: false,
      error:
        sent.reason === "not_configured"
          ? "Sign-in codes are not switched on for this deployment yet."
          : "The code could not be sent just now. Try again, or use your password.",
    };
  }

  await writeAudit({
    userId: account.id,
    action: "SIGNIN_CODE_SENT",
    resourceType: "login_codes",
    resourceId: account.id,
  });

  return { ok: true };
}

export type VerifyResult =
  | { ok: true; userId: string }
  | { ok: false; error: string };

export async function verifySignInCode(
  emailRaw: string,
  codeRaw: string,
): Promise<VerifyResult> {
  const email = emailRaw.trim().toLowerCase();
  const code = codeRaw.trim();

  const [row] = await query<{
    id: string;
    code_hash: string;
    attempts: number;
    max_attempts: number;
  }>(
    `SELECT id, code_hash, attempts, max_attempts
       FROM portal.login_codes
      WHERE lower(email) = $1
        AND consumed_at IS NULL AND revoked_at IS NULL AND expires_at > NOW()
      ORDER BY created_at DESC
      LIMIT 1`,
    [email],
  );

  // Expired, spent, or never issued — all the same answer. Which of the three
  // it was is information about the account, not about the request.
  if (!row) {
    return { ok: false, error: "That code is not valid. Ask for a new one." };
  }

  if (row.attempts >= row.max_attempts) {
    await query(`UPDATE portal.login_codes SET revoked_at = NOW() WHERE id = $1`, [row.id]);
    return { ok: false, error: "Too many tries. Ask for a new code." };
  }

  if (hash(code) !== row.code_hash) {
    await query(
      `UPDATE portal.login_codes SET attempts = attempts + 1 WHERE id = $1`,
      [row.id],
    );
    return { ok: false, error: "That code is not right." };
  }

  const [account] = await query<{ id: string }>(
    `SELECT id FROM public.users
      WHERE lower(email) = $1 AND is_active AND auth_provider = 'local'`,
    [email],
  );

  if (!account) {
    return { ok: false, error: "That code is not valid. Ask for a new one." };
  }

  // Spent at the moment it works, not afterwards: a second request racing this
  // one must not find it still usable.
  const consumed = await query<{ id: string }>(
    `UPDATE portal.login_codes SET consumed_at = NOW()
      WHERE id = $1 AND consumed_at IS NULL
      RETURNING id`,
    [row.id],
  );
  if (consumed.length === 0) {
    return { ok: false, error: "That code has already been used." };
  }

  await writeAudit({
    userId: account.id,
    action: "SIGNIN_CODE_ACCEPTED",
    resourceType: "login_codes",
    resourceId: account.id,
  });

  return { ok: true, userId: account.id };
}
