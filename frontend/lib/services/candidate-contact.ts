import { query, withUserContext } from "@/lib/db";
import { BlockingRuleError, NotFoundError } from "@/lib/services/blocking";
import { can, PermissionError } from "@/lib/services/permissions";
import { writeAudit } from "@/lib/services/audit";
import { sendMail, mailConfigured } from "@/lib/mail/send";
import { issueInvite } from "@/lib/services/candidate-portal";
import type { SessionUser } from "@/lib/auth/session";

/**
 * Getting the candidate's link to the candidate — S11 · People.
 *
 * db/056 gave every candidate a page and left HR copying the address into
 * whatever they were writing in. That is one manual step per person, repeated
 * for everybody, which is the kind of small friction that ends with half the
 * candidates never being sent anything.
 *
 * TWO CHANNELS, AND THE FREE ONE IS THE GOOD ONE.
 *
 * WhatsApp is what candidates in India actually answer, and it needs no API,
 * no Meta approval and no per-message cost — a `wa.me` link opens WhatsApp
 * with the number and the message already filled in, and HR presses send. The
 * portal never touches WhatsApp and never claims to have sent anything: it
 * composes, a person sends. That is honest about what happened, and it is
 * also why the trail says "prepared" rather than "sent" for this one.
 *
 * Email goes through Brevo, which the portal already uses for sign-in codes.
 * That one really is sent, by the server, so HR never sees the token at all —
 * which is better than the copy-paste it replaces, not just faster.
 *
 * THE TOKEN IS MINTED AT THE MOMENT OF SENDING, never looked up. Only its
 * hash is stored, so there is no path that recovers an old link — and that is
 * the right shape here anyway: sending someone their link and making them one
 * are the same act.
 *
 * WHAT THE MESSAGE MAY SAY. It names the company, the role and the link. It
 * does not carry the interview time, the panel, or anything else the page
 * itself will show — a WhatsApp message gets forwarded and screenshotted, and
 * the page behind the token is the thing with a fence around it.
 */

export type Channel = "whatsapp" | "email";

export type Prepared = {
  channel: Channel;
  /** Only for WhatsApp: the address HR's browser should open. */
  openUrl?: string;
  /** What was composed, so the screen can show it before anything happens. */
  message: string;
  sentTo: string | null;
  candidateName: string;
};

function digits(phone: string): string {
  return phone.replace(/[^0-9]/g, "");
}

/**
 * wa.me wants a full international number and nothing else — no plus, no
 * spaces. A ten-digit Indian mobile is assumed to be Indian; anything already
 * carrying a country code is left alone. Getting this wrong sends the message
 * to a stranger, so a number that is neither is refused rather than guessed
 * at.
 */
export function waNumber(phone: string): string | null {
  const d = digits(phone);

  // An Indian mobile is ten digits beginning 6-9. Ten digits beginning with
  // anything else is a landline or a typo, and neither has WhatsApp on it.
  if (d.length === 10) return /^[6-9]/.test(d) ? `91${d}` : null;

  // The trunk zero people write in front of a mobile.
  if (d.length === 11 && d.startsWith("0")) {
    const rest = d.slice(1);
    return /^[6-9]/.test(rest) ? `91${rest}` : null;
  }

  if (d.length === 12 && d.startsWith("91")) return d;

  /* Already international — a candidate abroad. Never starting with 0: a
     country code cannot, so a long string that does is a landline with an
     extension run together, or somebody's notes. Guessing at it is how a
     private link reaches a switchboard. */
  if (d.length >= 11 && d.length <= 15 && !d.startsWith("0")) return d;

  return null;
}

export function inviteMessage(input: {
  candidateName: string;
  roleTitle: string;
  url: string;
  senderName: string;
}): string {
  const first = input.candidateName.split(" ")[0];
  return (
    `Hello ${first}, this is ${input.senderName} from essentia.\n\n` +
    `Thank you for your interest in the ${input.roleTitle} role. ` +
    `Here is your own page — it has your interview times, and you can ` +
    `confirm them or tell us if a time does not work:\n\n` +
    `${input.url}\n\n` +
    `The link is yours alone, so please do not forward it. ` +
    `You can also add your CV there.`
  );
}

async function requireSender(user: SessionUser): Promise<void> {
  const see = await can(user, "hr_access", "hiring");
  if (!see.allowed) throw new PermissionError(user, "hr_access", "hiring");
  const invite = await can(user, "invite", "hiring");
  if (!invite.allowed) throw new PermissionError(user, "invite", "hiring");
}

async function candidateFor(
  user: SessionUser,
  candidateId: string,
): Promise<{ fullName: string; email: string | null; phone: string | null; roleTitle: string }> {
  return withUserContext(user, async (q) => {
    const [row] = await q<{
      full_name: string;
      email: string | null;
      phone: string | null;
      role_title: string;
    }>(
      `SELECT c.full_name, c.email, c.phone, r.title AS role_title
         FROM hr.candidates c
         JOIN hr.open_roles r ON r.id = c.role_id
        WHERE c.id = $1`,
      [candidateId],
    );
    if (!row) throw new NotFoundError(`No candidate ${candidateId}`);
    return {
      fullName: row.full_name,
      email: row.email,
      phone: row.phone,
      roleTitle: row.role_title,
    };
  });
}

/**
 * Compose a WhatsApp message and hand back the address that opens it.
 *
 * A fresh invite is minted here, because the token cannot be read back and
 * sending somebody their link IS making them one. Reissuing revokes whatever
 * they had, which is also correct: the last thing sent is the thing that
 * works.
 */
export async function prepareWhatsApp(
  user: SessionUser,
  candidateId: string,
): Promise<Prepared> {
  await requireSender(user);
  const candidate = await candidateFor(user, candidateId);

  if (!candidate.phone) {
    throw new BlockingRuleError(
      `There is no phone number on ${candidate.fullName}'s record. Add one first.`,
    );
  }
  const number = waNumber(candidate.phone);
  if (!number) {
    throw new BlockingRuleError(
      `"${candidate.phone}" is not a number WhatsApp will take. It needs a ` +
        "full mobile number — a message sent to a mistyped number goes to a stranger.",
    );
  }

  const issued = await issueInvite(user, candidateId);
  const message = inviteMessage({
    candidateName: candidate.fullName,
    roleTitle: candidate.roleTitle,
    url: issued.url,
    senderName: user.name,
  });

  // The portal composes; a person presses send. So the trail says prepared,
  // because claiming it was sent would be a claim the portal cannot check.
  await query(
    `INSERT INTO hr.candidate_activity (candidate_id, user_id, what, detail)
     VALUES ($1, $2, 'prepared their link for WhatsApp', $3)`,
    [candidateId, user.id, candidate.phone],
  );

  return {
    channel: "whatsapp",
    openUrl: `https://wa.me/${number}?text=${encodeURIComponent(message)}`,
    message,
    sentTo: candidate.phone,
    candidateName: candidate.fullName,
  };
}

/**
 * Email the link. Sent by the server, so the token never reaches HR's screen
 * at all — which is the real improvement over copy-paste, not the speed.
 */
export async function emailInvite(
  user: SessionUser,
  candidateId: string,
): Promise<Prepared> {
  await requireSender(user);

  if (!mailConfigured()) {
    throw new BlockingRuleError(
      "Email is not switched on for this deployment (BREVO_API_KEY / " +
        "MAIL_FROM). Use WhatsApp, or copy the link.",
    );
  }

  const candidate = await candidateFor(user, candidateId);
  if (!candidate.email) {
    throw new BlockingRuleError(
      `There is no email address on ${candidate.fullName}'s record. Add one first.`,
    );
  }

  const issued = await issueInvite(user, candidateId);
  const message = inviteMessage({
    candidateName: candidate.fullName,
    roleTitle: candidate.roleTitle,
    url: issued.url,
    senderName: user.name,
  });

  const result = await sendMail({
    to: candidate.email,
    toName: candidate.fullName,
    subject: `Your interview with essentia — ${candidate.roleTitle}`,
    text: message,
    // Deliberately plain. A candidate's mail client is as likely to be a phone
    // on a train as a desktop, and a layout that needs images to make sense is
    // a layout that fails there.
    html: message
      .split("\n\n")
      .map((para) =>
        para.startsWith("http")
          ? `<p><a href="${issued.url}">${issued.url}</a></p>`
          : `<p>${para.replace(/\n/g, "<br>")}</p>`,
      )
      .join(""),
  });

  if (!result.ok) {
    // The invite has already been minted and the old one revoked. Say so, or
    // HR resends and wonders why the first link stopped working.
    throw new BlockingRuleError(
      `${result.detail} The link was made but not sent — send it on WhatsApp, ` +
        "or copy it from the candidate's file.",
    );
  }

  await query(
    `INSERT INTO hr.candidate_activity (candidate_id, user_id, what, detail)
     VALUES ($1, $2, 'emailed them their link', $3)`,
    [candidateId, user.id, candidate.email],
  );
  await writeAudit({
    userId: user.id,
    role: user.accessLevel,
    action: "HIRING_INVITE_EMAILED",
    resourceType: "hiring",
    resourceId: candidateId,
    newValues: { to: candidate.email },
  });

  return {
    channel: "email",
    message,
    sentTo: candidate.email,
    candidateName: candidate.fullName,
  };
}

/* ── everybody at once ─────────────────────────────────────────────────── */

export type Contactable = {
  candidateId: string;
  name: string;
  roleTitle: string;
  stage: string;
  email: string | null;
  phone: string | null;
  /** Whether they hold a link that still works. */
  hasLiveLink: boolean;
  /** Whether they have ever opened it. */
  opened: boolean;
};

/**
 * Everyone still moving, with what can be reached and what has been.
 *
 * The two columns that matter are the last two: a candidate with no live link
 * has never been sent one, and one who has never opened theirs is the one to
 * chase. Without those, "contact everybody" means sending the same message to
 * people who replied last week.
 */
export async function listContactable(
  user: SessionUser,
): Promise<Contactable[]> {
  const see = await can(user, "hr_access", "hiring");
  if (!see.allowed) throw new PermissionError(user, "hr_access", "hiring");

  return withUserContext(user, async (q) => {
    const rows = await q<{
      id: string;
      full_name: string;
      role_title: string;
      stage_label: string;
      email: string | null;
      phone: string | null;
      has_live_link: boolean;
      opened: boolean;
    }>(
      `SELECT c.id, c.full_name, r.title AS role_title, s.label AS stage_label,
              c.email, c.phone,
              (i.id IS NOT NULL) AS has_live_link,
              COALESCE(i.seen_count, 0) > 0 AS opened
         FROM hr.candidates c
         JOIN hr.open_roles r ON r.id = c.role_id
         JOIN hr.interview_stages s ON s.code = c.stage
         LEFT JOIN hr.candidate_invites i
                ON i.candidate_id = c.id
               AND i.revoked_at IS NULL
               AND i.expires_at > NOW()
        WHERE c.status IN ('active', 'offered')
        ORDER BY s.seq, c.full_name`,
    );
    return rows.map((r) => ({
      candidateId: r.id,
      name: r.full_name,
      roleTitle: r.role_title,
      stage: r.stage_label,
      email: r.email,
      phone: r.phone,
      hasLiveLink: r.has_live_link,
      opened: r.opened,
    }));
  });
}

export type BulkOutcome = {
  candidateId: string;
  name: string;
  ok: boolean;
  error?: string;
};

/**
 * Email several people their links in one go.
 *
 * WhatsApp is deliberately NOT here. It works by opening a window per person,
 * which a browser blocks after the first and which would in any case be HR
 * pressing send twenty times. Bulk on that channel would mean pretending to
 * do something the portal cannot do.
 *
 * One failure does not stop the rest, and every outcome comes back named.
 * A run that stopped halfway would leave HR unable to tell who had been
 * written to without opening twenty files.
 */
export async function emailMany(
  user: SessionUser,
  candidateIds: string[],
): Promise<BulkOutcome[]> {
  await requireSender(user);

  if (candidateIds.length === 0) {
    throw new BlockingRuleError("Nobody is selected.");
  }
  // Not a technical limit — a pause. Twenty candidate emails in one press is
  // already a lot to have got wrong.
  if (candidateIds.length > 20) {
    throw new BlockingRuleError(
      "That is more than 20 people at once. Do it in smaller groups, so a " +
        "mistake is a small one.",
    );
  }

  const outcomes: BulkOutcome[] = [];
  for (const id of candidateIds) {
    try {
      const sent = await emailInvite(user, id);
      outcomes.push({ candidateId: id, name: sent.candidateName, ok: true });
    } catch (error) {
      outcomes.push({
        candidateId: id,
        name: id,
        ok: false,
        error: error instanceof Error ? error.message : "Failed.",
      });
    }
  }
  return outcomes;
}
