import { createHash, randomBytes } from "node:crypto";
import { query, withCandidateContext, withUserContext } from "@/lib/db";
import { BlockingRuleError, NotFoundError } from "@/lib/services/blocking";
import { can, PermissionError } from "@/lib/services/permissions";
import { writeAudit } from "@/lib/services/audit";
import { rateLimit } from "@/lib/security/rate-limit";
import type { SessionUser } from "@/lib/auth/session";

/**
 * The candidate's own page — S11 · People (Brief §32, §36).
 *
 * db/049 put hiring in one place for the people who do the hiring, and left
 * the candidate outside it. This is the other half: a link they open without
 * an account, showing the rounds that are booked and letting them say yes, say
 * no, or send their CV.
 *
 * EVERYTHING HERE IS WRITTEN AS IF THE TOKEN HAS ALREADY LEAKED. A link with
 * no login behind it gets forwarded, logged by a proxy, and pasted into group
 * chats. So the question this file keeps answering is not "is the holder the
 * candidate" — it cannot know that — but "what is the worst a stranger holding
 * this can do". The answer has to stay: read one person's interview times, and
 * reply to them.
 *
 * Four rules.
 *
 *   · The token is never stored. Only its SHA-256, the way db/041 holds
 *     sign-in codes. What HR sees once, at the moment it is made, is the only
 *     time the token exists outside the candidate's inbox.
 *
 *   · The money never crosses. `hr.candidates` carries what this person earns
 *     now and what they are asking for. RLS opens the row — it decides rows,
 *     not columns — so keeping those two columns from the page is this file's
 *     job, exactly as it is for a panel member in `hiring.ts`. There is one
 *     SELECT against that table on the candidate path and it names its
 *     columns. Do not add `SELECT *` here.
 *
 *   · Neither does the verdict. Scorecards and the activity trail are fenced
 *     by db/049's own policies, which open for HR or the card's author and a
 *     candidate is neither. This file never queries them on the candidate
 *     path either, so it would take both a policy change and a code change to
 *     show somebody what the room thought of them.
 *
 *   · A finished candidate has no page. Rejected, withdrawn or hired, the link
 *     stops working whatever its expiry says. A standing secret belonging to
 *     somebody the company has finished with is a secret with no owner.
 */

/* ── the shape of the page ─────────────────────────────────────────────── */

export type CandidateRound = {
  id: string;
  stage: string;              // the label, not the code — 'HOD round'
  scheduledAt: string;
  durationMins: number;
  mode: "in_person" | "video" | "phone";
  location: string | null;
  status: "scheduled" | "done" | "cancelled" | "no_show";
  /* Who they will meet, by name. Not their email or their title: a candidate
     who knows they are meeting Hitesh can prepare, and does not thereby get a
     staff directory out of a page that has no login on it. */
  meeting: string[];
  /* Their own last word on this round, if they have said one. */
  reply: { response: RoundResponse; note: string | null; at: string } | null;
};

export type RoundResponse = "confirmed" | "reschedule_requested";

export type CandidateDocument = {
  id: string;
  kind: "resume" | "portfolio" | "other";
  filename: string;
  sizeBytes: number;
  uploadedBy: "candidate" | "hr";
  uploadedAt: string;
};

export type CandidateView = {
  candidateId: string;
  fullName: string;
  roleTitle: string;
  /* Where they are, in words they can read. Not the status: "rejected" is not
     something a candidate should learn from a web page. */
  stage: string;
  rounds: CandidateRound[];
  documents: CandidateDocument[];
};

export type InviteStatus = {
  issuedAt: string;
  expiresAt: string;
  sentTo: string | null;
  lastSeenAt: string | null;
  seenCount: number;
  expired: boolean;
};

/* ── the token ─────────────────────────────────────────────────────────── */

/** How long a link lives unless somebody says otherwise. */
const INVITE_DAYS = 21;

/** Biggest CV we will take. A 5 MB PDF is already somebody's whole portfolio. */
export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;

/* What a browser may send us. Not an allowlist of extensions — the extension
   is whatever the uploader typed — and not images, because a CV that is a
   screenshot is a CV nobody can search. */
const ACCEPTED_MIME = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

/**
 * 32 bytes from the CSPRNG, base64url. Long enough that guessing is not a
 * strategy, short enough to survive being pasted into an email client that
 * wraps lines.
 */
function newToken(): string {
  return randomBytes(32).toString("base64url");
}

function appUrl(): string {
  return process.env.APP_BASE_URL ?? "http://localhost:3000";
}

export function inviteUrl(token: string): string {
  return `${appUrl()}/interview/${token}`;
}

/* ── HR's side: making and withdrawing the link ────────────────────────── */

async function requireInviter(user: SessionUser): Promise<void> {
  const see = await can(user, "hr_access", "hiring");
  if (!see.allowed) throw new PermissionError(user, "hr_access", "hiring");
  const invite = await can(user, "invite", "hiring");
  if (!invite.allowed) throw new PermissionError(user, "invite", "hiring");
}

export type IssuedInvite = {
  token: string;
  url: string;
  expiresAt: string;
  /* The address on the candidate's record, for HR to send it to. Null when
     nobody ever wrote one down, which is the usual reason a link goes
     nowhere. */
  candidateEmail: string | null;
};

/**
 * Make a candidate their link. Reissuing revokes the last one in the same
 * transaction — two live links for one person is two things to withdraw and
 * one of them gets forgotten (db/056 has the unique index that says so).
 *
 * The token is returned exactly once, here. It is not stored, not audited and
 * not recoverable: a lost link is reissued rather than looked up.
 */
export async function issueInvite(
  user: SessionUser,
  candidateId: string,
  days = INVITE_DAYS,
): Promise<IssuedInvite> {
  await requireInviter(user);

  const token = newToken();
  const result = await withUserContext(user, async (q) => {
    const [candidate] = await q<{
      full_name: string;
      email: string | null;
      status: string;
    }>(
      "SELECT full_name, email, status FROM hr.candidates WHERE id = $1",
      [candidateId],
    );
    if (!candidate) throw new NotFoundError(`No candidate ${candidateId}`);

    // Sending a page to somebody the company has finished with is the mistake
    // this refusal exists to stop, and it is easier to make than it sounds:
    // the reject button and the invite button are on the same screen.
    if (!isLive(candidate.status)) {
      throw new BlockingRuleError(
        `${candidate.full_name} is marked ${candidate.status}. A link would ` +
          "show them rounds for a process that has stopped. Reopen them first " +
          "if that is wrong.",
      );
    }

    await q(
      `UPDATE hr.candidate_invites
          SET revoked_at = NOW(), revoked_by = $2
        WHERE candidate_id = $1 AND revoked_at IS NULL`,
      [candidateId, user.id],
    );

    const [row] = await q<{ expires_at: Date }>(
      `INSERT INTO hr.candidate_invites
         (candidate_id, token_hash, sent_to, issued_by, expires_at)
       VALUES ($1, $2, $3, $4, NOW() + ($5 || ' days')::INTERVAL)
       RETURNING expires_at`,
      [candidateId, hash(token), candidate.email, user.id, String(days)],
    );

    await q(
      `INSERT INTO hr.candidate_activity (candidate_id, user_id, what, detail)
       VALUES ($1, $2, 'sent their own page', $3)`,
      [candidateId, user.id, candidate.email ?? "no address on record"],
    );

    return { expiresAt: row.expires_at.toISOString(), email: candidate.email };
  });

  await writeAudit({
    userId: user.id,
    role: user.accessLevel,
    action: "HIRING_INVITE_ISSUED",
    resourceType: "hiring",
    resourceId: candidateId,
    newValues: { expiresAt: result.expiresAt, sentTo: result.email },
  });

  return {
    token,
    url: inviteUrl(token),
    expiresAt: result.expiresAt,
    candidateEmail: result.email,
  };
}

/** Withdraw the link. Idempotent — withdrawing nothing is not an error. */
export async function revokeInvite(
  user: SessionUser,
  candidateId: string,
): Promise<void> {
  await requireInviter(user);

  const revoked = await withUserContext(user, async (q) => {
    const rows = await q<{ id: string }>(
      `UPDATE hr.candidate_invites
          SET revoked_at = NOW(), revoked_by = $2
        WHERE candidate_id = $1 AND revoked_at IS NULL
        RETURNING id`,
      [candidateId, user.id],
    );
    if (rows.length > 0) {
      await q(
        `INSERT INTO hr.candidate_activity (candidate_id, user_id, what, detail)
         VALUES ($1, $2, 'withdrew their page', NULL)`,
        [candidateId, user.id],
      );
    }
    return rows.length;
  });

  if (revoked > 0) {
    await writeAudit({
      userId: user.id,
      role: user.accessLevel,
      action: "HIRING_INVITE_REVOKED",
      resourceType: "hiring",
      resourceId: candidateId,
    });
  }
}

/**
 * What HR sees about the link on the candidate's file. Never the token —
 * there is nothing stored that could produce it.
 */
export async function inviteStatus(
  user: SessionUser,
  candidateId: string,
): Promise<InviteStatus | null> {
  const see = await can(user, "hr_access", "hiring");
  if (!see.allowed) throw new PermissionError(user, "hr_access", "hiring");

  return withUserContext(user, async (q) => {
    const [row] = await q<{
      issued_at: Date;
      expires_at: Date;
      sent_to: string | null;
      last_seen_at: Date | null;
      seen_count: number;
    }>(
      `SELECT issued_at, expires_at, sent_to, last_seen_at, seen_count
         FROM hr.candidate_invites
        WHERE candidate_id = $1 AND revoked_at IS NULL`,
      [candidateId],
    );
    if (!row) return null;
    return {
      issuedAt: row.issued_at.toISOString(),
      expiresAt: row.expires_at.toISOString(),
      sentTo: row.sent_to,
      lastSeenAt: row.last_seen_at ? row.last_seen_at.toISOString() : null,
      seenCount: row.seen_count,
      expired: row.expires_at.getTime() <= Date.now(),
    };
  });
}

/* ── the candidate's side ──────────────────────────────────────────────── */

function isLive(status: string): boolean {
  return status === "active" || status === "offered";
}

/**
 * Turn a token into the candidate it belongs to, or nothing.
 *
 * WHY THIS ONE RUNS AS THE OWNER. Every other read on this path is fenced by
 * `app.candidate_id`, and this is the query that works out what to put in it.
 * It cannot be fenced by the thing it is looking up. So it is kept to exactly
 * this: one join, three columns, no candidate detail beyond whether they are
 * still moving. Nothing that reaches a caller comes out of it.
 *
 * Every refusal returns the same `null`. A token that is expired, withdrawn,
 * or simply wrong must be indistinguishable from outside, or the page becomes
 * a way to find out which tokens once existed.
 */
async function resolveToken(token: string): Promise<string | null> {
  if (!token || token.length > 128) return null;

  const rows = await query<{
    candidate_id: string;
    invite_id: string;
    status: string;
  }>(
    `SELECT i.candidate_id, i.id AS invite_id, c.status
       FROM hr.candidate_invites i
       JOIN hr.candidates c ON c.id = i.candidate_id
      WHERE i.token_hash = $1
        AND i.revoked_at IS NULL
        AND i.expires_at > NOW()`,
    [hash(token)],
  );
  const row = rows[0];
  if (!row) return null;
  if (!isLive(row.status)) return null;

  // Proof they opened it. HR chasing somebody who never received the mail is
  // a different conversation from chasing somebody ignoring it.
  await query(
    `UPDATE hr.candidate_invites
        SET last_seen_at = NOW(), seen_count = seen_count + 1
      WHERE id = $1`,
    [row.invite_id],
  );

  return row.candidate_id;
}

/**
 * Guessing is not a strategy against a 32-byte token, but a page with no login
 * on it should not be a free endpoint either. Keyed on the caller's address,
 * not the token: rate-limiting per token would let somebody with a valid link
 * lock nobody out but themselves, which protects the wrong thing.
 */
function throttle(ip: string | null, bucket: string, limit: number): void {
  const result = rateLimit(`candidate:${bucket}:${ip ?? "unknown"}`, limit, 60);
  if (!result.allowed) {
    throw new BlockingRuleError(
      `Too many attempts. Try again in ${result.retryAfterSeconds} seconds.`,
    );
  }
}

/**
 * The page itself.
 *
 * The SELECT against `hr.candidates` names its columns, and the two it does
 * not name are `current_ctc` and `expected_ctc`. That is the whole of how the
 * money is kept off this page — RLS cannot do it, because the row is
 * legitimately theirs.
 */
export async function openCandidatePage(
  token: string,
  ip: string | null,
): Promise<CandidateView | null> {
  throttle(ip, "open", 30);

  const candidateId = await resolveToken(token);
  if (!candidateId) return null;

  return withCandidateContext(candidateId, async (q) => {
    const [who] = await q<{
      full_name: string;
      role_title: string;
      stage_label: string;
    }>(
      `SELECT c.full_name, r.title AS role_title, s.label AS stage_label
         FROM hr.candidates c
         JOIN hr.open_roles r ON r.id = c.role_id
         JOIN hr.interview_stages s ON s.code = c.stage
        WHERE c.id = $1`,
      [candidateId],
    );
    // The fence refusing here would mean the GUC and the policies disagree,
    // which is a bug rather than a missing candidate. Either way: no page.
    if (!who) return null;

    const rounds = await q<{
      id: string;
      stage_label: string;
      scheduled_at: Date;
      duration_mins: number;
      mode: CandidateRound["mode"];
      location: string | null;
      status: CandidateRound["status"];
      meeting: string[] | null;
      reply_response: RoundResponse | null;
      reply_note: string | null;
      reply_at: Date | null;
    }>(
      `SELECT i.id,
              s.label AS stage_label,
              i.scheduled_at, i.duration_mins, i.mode, i.location, i.status,
              -- Names only. display_name is what the person chose to be
              -- called; their address stays inside the company.
              ARRAY(
                SELECT u.display_name
                  FROM hr.interview_panel p
                  JOIN public.users u ON u.id = p.user_id
                 WHERE p.interview_id = i.id
                 ORDER BY p.is_lead DESC, u.display_name
              ) AS meeting,
              last_reply.response AS reply_response,
              last_reply.note     AS reply_note,
              last_reply.at       AS reply_at
         FROM hr.interviews i
         JOIN hr.interview_stages s ON s.code = i.stage_code
         LEFT JOIN LATERAL (
           SELECT response, note, at
             FROM hr.interview_responses
            WHERE interview_id = i.id
            ORDER BY at DESC
            LIMIT 1
         ) AS last_reply ON TRUE
        WHERE i.candidate_id = $1
          AND i.status <> 'cancelled'
        ORDER BY i.scheduled_at`,
      [candidateId],
    );

    const documents = await q<{
      id: string;
      kind: CandidateDocument["kind"];
      filename: string;
      size_bytes: number;
      uploaded_by: CandidateDocument["uploadedBy"];
      uploaded_at: Date;
    }>(
      `SELECT id, kind, filename, size_bytes, uploaded_by, uploaded_at
         FROM hr.candidate_documents
        WHERE candidate_id = $1
        ORDER BY uploaded_at DESC`,
      [candidateId],
    );

    return {
      candidateId,
      fullName: who.full_name,
      roleTitle: who.role_title,
      stage: who.stage_label,
      rounds: rounds.map((r) => ({
        id: r.id,
        stage: r.stage_label,
        scheduledAt: r.scheduled_at.toISOString(),
        durationMins: r.duration_mins,
        mode: r.mode,
        location: r.location,
        status: r.status,
        meeting: r.meeting ?? [],
        reply: r.reply_response
          ? {
              response: r.reply_response,
              note: r.reply_note,
              at: (r.reply_at as Date).toISOString(),
            }
          : null,
      })),
      documents: documents.map((d) => ({
        id: d.id,
        kind: d.kind,
        filename: d.filename,
        sizeBytes: d.size_bytes,
        uploadedBy: d.uploaded_by,
        uploadedAt: d.uploaded_at.toISOString(),
      })),
    };
  });
}

/**
 * "I will be there", or "I cannot, and here is why".
 *
 * A reschedule needs a reason, for the same reason a rejection does in
 * `hiring.ts`: "cannot make it" with nothing after it costs two more emails
 * to resolve, and the round is already in somebody's diary.
 *
 * Nothing here moves the interview. The candidate asks; HR decides and
 * reschedules. A page that let the person being interviewed rewrite four
 * people's afternoons would be a different and much worse page.
 */
export async function respondToRound(
  token: string,
  interviewId: string,
  response: RoundResponse,
  note: string | null,
  ip: string | null,
): Promise<void> {
  throttle(ip, "reply", 10);

  const candidateId = await resolveToken(token);
  if (!candidateId) throw new NotFoundError("That link no longer works.");

  const reason = (note ?? "").trim();
  if (response === "reschedule_requested" && !reason) {
    throw new BlockingRuleError(
      "Tell us why, in a line. Somebody has to find another time that works " +
        "and they need something to go on.",
    );
  }

  await withCandidateContext(candidateId, async (q) => {
    // The WHERE is the fence saying it twice: RLS already limits this table
    // to their own rounds, and naming the candidate again means a bug in a
    // policy does not become somebody replying to a stranger's interview.
    const [round] = await q<{ id: string; status: string }>(
      `SELECT id, status FROM hr.interviews
        WHERE id = $1 AND candidate_id = $2`,
      [interviewId, candidateId],
    );
    if (!round) throw new NotFoundError("No such interview.");
    if (round.status !== "scheduled") {
      throw new BlockingRuleError(
        "That round is no longer in the diary. If something has changed, " +
          "reply to the email that brought you here.",
      );
    }

    await q(
      `INSERT INTO hr.interview_responses (interview_id, response, note)
       VALUES ($1, $2, NULLIF($3, ''))`,
      [interviewId, response, reason],
    );
  });

  // The trail is HR's table and the candidate cannot write to it — the policy
  // in db/049 opens it for HR only. So this line is written as the owner, and
  // says plainly that it was the candidate and not a member of staff.
  await query(
    `INSERT INTO hr.candidate_activity (candidate_id, user_id, what, detail)
     VALUES ($1, NULL, $2, $3)`,
    [
      candidateId,
      response === "confirmed"
        ? "confirmed their round"
        : "asked to move their round",
      reason || null,
    ],
  );

  await writeAudit({
    action: "HIRING_CANDIDATE_REPLY",
    resourceType: "hiring",
    resourceId: candidateId,
    newValues: { interviewId, response },
  });
}

/**
 * Their CV, in the database beside the row it belongs to — the way
 * `ee.concept_deck_images` holds a picture. db/049 pointed `resume_url` at S3
 * or Drive and neither is configured; a candidate cannot upload to a bucket
 * that does not exist.
 *
 * The MIME type is taken from the upload and checked against a short list,
 * and the bytes are never executed, never rendered inline, and served back
 * only as an attachment. A file this page accepts is a file this page hands
 * to HR to open in Word — nothing more clever than that.
 */
export async function uploadDocument(
  token: string,
  file: { filename: string; mime: string; bytes: Buffer },
  kind: CandidateDocument["kind"],
  ip: string | null,
): Promise<void> {
  throttle(ip, "upload", 5);

  const candidateId = await resolveToken(token);
  if (!candidateId) throw new NotFoundError("That link no longer works.");

  if (!ACCEPTED_MIME.has(file.mime)) {
    throw new BlockingRuleError(
      "Send a PDF or a Word document. Those are the two things whoever reads " +
        "it can open.",
    );
  }
  if (file.bytes.length === 0) {
    throw new BlockingRuleError("That file is empty.");
  }
  if (file.bytes.length > MAX_DOCUMENT_BYTES) {
    throw new BlockingRuleError(
      `That file is larger than ${Math.round(MAX_DOCUMENT_BYTES / (1024 * 1024))} MB. ` +
        "Send the CV rather than the whole portfolio.",
    );
  }

  // Their filename, not a path. A name with a slash or a traversal in it is
  // never used to open anything here — it is a label on a row — but it is
  // rendered on HR's screen, and a filename is somebody else's input.
  const filename = file.filename
    .replace(/[\r\n\t]/g, " ")
    .split(/[\\/]/)
    .pop()!
    .slice(0, 200)
    .trim();

  await withCandidateContext(candidateId, async (q) => {
    // One live file per kind: a candidate who sends a second CV means the
    // first one is wrong, and HR reading the wrong one is the failure.
    await q(
      `DELETE FROM hr.candidate_documents
        WHERE candidate_id = $1 AND kind = $2 AND uploaded_by = 'candidate'`,
      [candidateId, kind],
    );
    await q(
      `INSERT INTO hr.candidate_documents
         (candidate_id, kind, filename, mime, bytes, size_bytes, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, 'candidate')`,
      [
        candidateId,
        kind,
        filename || "cv",
        file.mime,
        file.bytes,
        file.bytes.length,
      ],
    );
  });

  await query(
    `INSERT INTO hr.candidate_activity (candidate_id, user_id, what, detail)
     VALUES ($1, NULL, 'sent a document', $2)`,
    [candidateId, filename || "cv"],
  );
}

/* ── reading a document back, inside the portal ────────────────────────── */

export type StoredDocument = {
  filename: string;
  mime: string;
  bytes: Buffer;
};

/**
 * For HR and for the panel. The policy in db/056 opens a candidate's files to
 * whoever is sitting on one of their rounds — an interviewer who has not read
 * the CV is the interviewer who asks what the candidate already wrote down.
 *
 * This runs under the reader's own context, so the fence is Postgres's and
 * not a WHERE clause here: somebody on no panel gets no rows.
 */
export async function readDocument(
  user: SessionUser,
  documentId: string,
): Promise<StoredDocument | null> {
  return withUserContext(user, async (q) => {
    const [row] = await q<{ filename: string; mime: string; bytes: Buffer }>(
      "SELECT filename, mime, bytes FROM hr.candidate_documents WHERE id = $1",
      [documentId],
    );
    return row ?? null;
  });
}

export async function listDocuments(
  user: SessionUser,
  candidateId: string,
): Promise<CandidateDocument[]> {
  return withUserContext(user, async (q) => {
    const rows = await q<{
      id: string;
      kind: CandidateDocument["kind"];
      filename: string;
      size_bytes: number;
      uploaded_by: CandidateDocument["uploadedBy"];
      uploaded_at: Date;
    }>(
      `SELECT id, kind, filename, size_bytes, uploaded_by, uploaded_at
         FROM hr.candidate_documents
        WHERE candidate_id = $1
        ORDER BY uploaded_at DESC`,
      [candidateId],
    );
    return rows.map((d) => ({
      id: d.id,
      kind: d.kind,
      filename: d.filename,
      sizeBytes: d.size_bytes,
      uploadedBy: d.uploaded_by,
      uploadedAt: d.uploaded_at.toISOString(),
    }));
  });
}

/* ── what the candidates said, for the board ───────────────────────────── */

export type PendingReply = {
  interviewId: string;
  candidateId: string;
  candidateName: string;
  stage: string;
  scheduledAt: string;
  response: RoundResponse;
  note: string | null;
  at: string;
};

/**
 * The replies sitting against rounds that are still in the diary — the thing
 * HR opens the board to find out. A confirmation is worth showing too, not
 * just a problem: the round nobody has confirmed is the one to chase.
 */
export async function listReplies(user: SessionUser): Promise<PendingReply[]> {
  const see = await can(user, "hr_access", "hiring");
  if (!see.allowed) throw new PermissionError(user, "hr_access", "hiring");

  return withUserContext(user, async (q) => {
    const rows = await q<{
      interview_id: string;
      candidate_id: string;
      candidate_name: string;
      stage_label: string;
      scheduled_at: Date;
      response: RoundResponse;
      note: string | null;
      at: Date;
    }>(
      `SELECT i.id AS interview_id,
              c.id AS candidate_id,
              c.full_name AS candidate_name,
              s.label AS stage_label,
              i.scheduled_at,
              r.response, r.note, r.at
         FROM hr.interviews i
         JOIN hr.candidates c ON c.id = i.candidate_id
         JOIN hr.interview_stages s ON s.code = i.stage_code
         JOIN LATERAL (
           SELECT response, note, at
             FROM hr.interview_responses
            WHERE interview_id = i.id
            ORDER BY at DESC
            LIMIT 1
         ) AS r ON TRUE
        WHERE i.status = 'scheduled'
        ORDER BY r.at DESC
        LIMIT 50`,
    );
    return rows.map((r) => ({
      interviewId: r.interview_id,
      candidateId: r.candidate_id,
      candidateName: r.candidate_name,
      stage: r.stage_label,
      scheduledAt: r.scheduled_at.toISOString(),
      response: r.response,
      note: r.note,
      at: r.at.toISOString(),
    }));
  });
}

