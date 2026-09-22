import { createHash, timingSafeEqual } from "node:crypto";
import { query, withCandidateContext } from "@/lib/db";
import { BlockingRuleError, NotFoundError } from "@/lib/services/blocking";
import { can } from "@/lib/services/permissions";
import { writeAudit } from "@/lib/services/audit";
import { rateLimit } from "@/lib/security/rate-limit";
import type { SessionUser } from "@/lib/auth/session";
import type {
  CandidateRound,
  RoundResponse,
} from "@/lib/services/candidate-portal";

/**
 * The voice agent's way in — S11 · People (db/057).
 *
 * An agent rings a candidate to confirm a round, or answers when they ring
 * back. It is a machine, it authenticates as a machine, and it never claims
 * to be a person: every call names the member of staff it is acting FOR, and
 * that name goes in the trail beside the fact that a machine placed the call.
 *
 * THE WHOLE DIFFICULTY IS IDENTITY, AND IT IS WORTH BEING PRECISE.
 *
 * `candidate-portal.ts` had a 32-byte token and holding it was the proof. A
 * phone call has nothing like that. Caller ID is spoofable, numbers are
 * reassigned, phones are shared. So a number is treated as a HINT and never
 * as an identity, and the sequence is deliberately the awkward way round:
 *
 *   · Starting a call discloses NOTHING — not the candidate's name, not
 *     whether the number is even known to us. An unknown number gets a call
 *     id exactly like a known one, or this becomes a way to test numbers
 *     against our candidate list one at a time.
 *
 *   · The CALLER says their name; the server compares. The agent is never
 *     told the name to read out. "Am I speaking to Aarti Sethi?" hands a
 *     wrong number the answer and makes the confirmation worthless — the
 *     question has to be "who am I speaking to?".
 *
 *   · Three wrong answers and the call is dead. Counted on the row, not in
 *     memory, so hanging up and redialling does not buy three more.
 *
 * WHAT A CALL IS WORTH ONCE IT IS OPEN. Exactly what the link in db/056 is
 * worth: one person's rounds, the panel's names, and the ability to reply.
 * Somebody holding the candidate's phone who knows their name gets that —
 * which is the same exposure as somebody holding a forwarded link, and the
 * reason the money and the scorecards are unreachable on both paths.
 *
 * It reads through `withCandidateContext()` — db/056's fence, not a second
 * one. There is one set of policies deciding what a candidate's data opens
 * for, and a new channel does not get to bring its own.
 */

/* ── the agent authenticating as a machine ─────────────────────────────── */

/**
 * The agent is not a user and must not have a session. It presents a shared
 * key, compared in constant time — a plain `===` on a secret leaks its length
 * and prefix to anybody able to time the endpoint.
 *
 * Unset key means the channel is OFF, not open. A deployment that has not
 * configured a voice agent should refuse every call rather than accept every
 * call, which is the failure mode a truthy check would give.
 */
export function agentAuthenticated(presented: string | null): boolean {
  const expected = process.env.VOICE_AGENT_API_KEY;
  if (!expected || expected.length < 32) return false;
  if (!presented) return false;

  // Hashed before comparing so the two buffers are always the same length —
  // timingSafeEqual throws on a length mismatch, which would itself be a
  // signal about the key's length.
  const a = createHash("sha256").update(presented).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/* ── matching a spoken name ────────────────────────────────────────────── */

/** Digits only: '+91 98100 11122' and '9810011122' are the same phone. */
function digits(phone: string): string {
  return phone.replace(/[^0-9]/g, "");
}

function tokens(name: string): string[] {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

/** Levenshtein, capped — used only to absorb one transcription slip. */
function within1(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let slips = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i += 1;
      j += 1;
      continue;
    }
    slips += 1;
    if (slips > 1) return false;
    if (a.length > b.length) i += 1;
    else if (b.length > a.length) j += 1;
    else {
      i += 1;
      j += 1;
    }
  }
  return slips + (a.length - i) + (b.length - j) <= 1;
}

/**
 * Does what they said match who we think they are?
 *
 * EVERY part of the candidate's name must appear in what was spoken. Saying
 * "Aarti" for "Aarti Sethi" does not pass — a first name is a guess anybody
 * could make, and the agent can simply ask for the surname. What is forgiven
 * is one character per word, because this string came out of speech
 * recognition and "Sethi" arrives as "Sethy" often enough to matter.
 *
 * Extra words are ignored: people answer "yes, this is Aarti Sethi speaking".
 */
export function nameMatches(spoken: string, actual: string): boolean {
  const said = tokens(spoken);
  const real = tokens(actual);
  if (real.length === 0 || said.length === 0) return false;
  return real.every((part) => said.some((word) => within1(part, word)));
}

/* ── who the call is for ───────────────────────────────────────────────── */

type Staff = SessionUser & { displayName: string };

/**
 * The member of staff the agent is acting for. They must exist, be active,
 * and be allowed to do this themselves — an agent cannot be used to do, on
 * somebody's behalf, a thing that person could not do signed in.
 */
async function resolveStaff(email: string): Promise<Staff> {
  const [row] = await query<{
    id: string;
    display_name: string;
    full_name: string;
    access_level: SessionUser["accessLevel"];
    department_id: string | null;
    is_active: boolean;
  }>(
    `SELECT id, display_name, full_name, access_level, department_id, is_active
       FROM public.users WHERE lower(email) = lower($1)`,
    [email],
  );
  if (!row || !row.is_active) {
    throw new NotFoundError(
      `No active account for ${email}. A call has to be made for somebody.`,
    );
  }

  /* No cast. If SessionUser grows a field, this should stop compiling rather
     than quietly hand `can()` a half-built user. */
  const staff: Staff = {
    id: row.id,
    name: row.full_name,
    accessLevel: row.access_level,
    departmentId: row.department_id,
    displayName: row.display_name || row.full_name,
  };

  const decision = await can(staff, "invite", "hiring");
  if (!decision.allowed) {
    throw new BlockingRuleError(
      `${staff.displayName} is not permitted to contact candidates, so the ` +
        "agent cannot do it for them either.",
    );
  }
  return staff;
}

/* ── starting a call ───────────────────────────────────────────────────── */

export type StartedCall = {
  callId: string;
  /* What the agent should say. Returned rather than left to the agent so the
     disclosure — that this is an assistant, and whose — is part of the API
     rather than part of a prompt somebody can edit. */
  say: string;
};

/**
 * Open a call. Deliberately learns nothing and says nothing.
 *
 * A call id comes back whether or not the number belongs to anybody, so the
 * endpoint cannot be used to find out which numbers are candidates'.
 */
export async function startCall(input: {
  phone: string;
  direction: "outbound" | "inbound";
  onBehalfOf: string;
}): Promise<StartedCall> {
  const staff = await resolveStaff(input.onBehalfOf);

  const phone = digits(input.phone);
  if (phone.length < 7) {
    throw new BlockingRuleError("That is not a phone number.");
  }

  // A number being worked through a list, or an attacker walking a range,
  // hits this before it hits the name check.
  const limit = rateLimit(`voice:start:${phone}`, 5, 900);
  if (!limit.allowed) {
    throw new BlockingRuleError(
      `Too many calls to that number. Try again in ${limit.retryAfterSeconds} seconds.`,
    );
  }

  const [call] = await query<{ id: string }>(
    `INSERT INTO hr.voice_calls (phone, direction, on_behalf_of)
     VALUES ($1, $2, $3) RETURNING id`,
    [phone, input.direction, staff.id],
  );

  return {
    callId: call!.id,
    say:
      `This is the essentia hiring assistant, calling on behalf of ` +
      `${staff.displayName}. Before I say anything about your interview, ` +
      `could you tell me your full name?`,
  };
}

/* ── proving who is on the line ────────────────────────────────────────── */

export type Identified =
  | { ok: true; candidateId: string; firstName: string; say: string }
  | { ok: false; triesLeft: number; say: string };

/**
 * The caller has said their name. Compare it, and open the call only if it
 * matches the candidate the number belongs to.
 *
 * The failure message never distinguishes "that is not the name" from "we do
 * not know this number" — both are the same sentence, or the pair of them
 * becomes an oracle.
 */
export async function identifyCaller(
  callId: string,
  spokenName: string,
): Promise<Identified> {
  const [call] = await query<{
    id: string;
    phone: string;
    status: string;
    attempts: number;
    expired: boolean;
  }>(
    `SELECT id, phone, status, attempts, (expires_at <= NOW()) AS expired
       FROM hr.voice_calls WHERE id = $1`,
    [callId],
  );
  if (!call) throw new NotFoundError("No such call.");
  if (call.status === "open") {
    throw new BlockingRuleError("That call is already identified.");
  }
  if (call.status !== "identifying" || call.expired) {
    throw new BlockingRuleError("That call is over. Start a new one.");
  }

  const attempts = call.attempts + 1;
  const triesLeft = Math.max(0, 3 - attempts);

  /* Candidates on that number who are still moving. More than one is
     ordinary — a shared family phone — and the name is what picks between
     them, which is the other reason the caller says it rather than us. */
  const candidates = await query<{ id: string; full_name: string }>(
    `SELECT c.id, c.full_name
       FROM hr.candidates c
      WHERE regexp_replace(COALESCE(c.phone, ''), '[^0-9]', '', 'g') = $1
        AND c.status IN ('active', 'offered')`,
    [call.phone],
  );

  const matched = candidates.find((c) => nameMatches(spokenName, c.full_name));

  if (!matched) {
    await query(
      `UPDATE hr.voice_calls
          SET attempts = $2, status = CASE WHEN $2 >= 3 THEN 'failed' ELSE status END
        WHERE id = $1`,
      [callId, attempts],
    );
    await writeAudit({
      action: "HIRING_VOICE_IDENTIFY_FAILED",
      resourceType: "hiring",
      resourceId: callId,
      // The spoken name is NOT recorded. A failed identification is somebody
      // saying a name into a phone, and if it was not our candidate's it is
      // a stranger's and none of our business.
      newValues: { attempts, phoneDigits: call.phone.length },
    });
    return {
      ok: false,
      triesLeft,
      say:
        triesLeft > 0
          ? "Sorry, I could not match that. Could you say your full name again?"
          : "Sorry, I have not been able to confirm who I am speaking to, so " +
            "I cannot discuss an interview. Someone from essentia will be in touch.",
    };
  }

  await query(
    `UPDATE hr.voice_calls
        SET candidate_id = $2, status = 'open', identified_at = NOW(),
            attempts = $3
      WHERE id = $1`,
    [callId, matched.id, attempts],
  );
  await writeAudit({
    action: "HIRING_VOICE_IDENTIFIED",
    resourceType: "hiring",
    resourceId: matched.id,
    newValues: { callId },
  });

  const firstName = matched.full_name.split(" ")[0]!;
  return {
    ok: true,
    candidateId: matched.id,
    firstName,
    say: `Thank you, ${firstName}. Let me tell you what is booked.`,
  };
}

/* ── what the agent may then read and write ────────────────────────────── */

/** An open, unexpired call, resolved to the candidate it belongs to. */
async function openCall(callId: string): Promise<{
  candidateId: string;
  onBehalfOf: string;
}> {
  const [call] = await query<{
    candidate_id: string | null;
    on_behalf_of: string;
    status: string;
    expired: boolean;
  }>(
    `SELECT candidate_id, on_behalf_of, status, (expires_at <= NOW()) AS expired
       FROM hr.voice_calls WHERE id = $1`,
    [callId],
  );
  if (!call) throw new NotFoundError("No such call.");
  if (call.status !== "open" || !call.candidate_id || call.expired) {
    throw new BlockingRuleError(
      "That call has not been identified, or it is over.",
    );
  }
  return { candidateId: call.candidate_id, onBehalfOf: call.on_behalf_of };
}

export type CallRounds = {
  firstName: string;
  roleTitle: string;
  rounds: CandidateRound[];
};

/**
 * The rounds, for the agent to read out.
 *
 * Note what this does NOT select, and that it is the same list as the web
 * page's: no money, and nothing from the scorecards. A channel does not get
 * to widen what a candidate may know about themselves.
 */
export async function roundsForCall(callId: string): Promise<CallRounds> {
  const { candidateId } = await openCall(callId);

  return withCandidateContext(candidateId, async (q) => {
    const [who] = await q<{ full_name: string; role_title: string }>(
      `SELECT c.full_name, r.title AS role_title
         FROM hr.candidates c
         JOIN hr.open_roles r ON r.id = c.role_id
        WHERE c.id = $1`,
      [candidateId],
    );
    if (!who) throw new NotFoundError("No such candidate.");

    const rows = await q<{
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
      `SELECT i.id, s.label AS stage_label, i.scheduled_at, i.duration_mins,
              i.mode, i.location, i.status,
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
           SELECT response, note, at FROM hr.interview_responses
            WHERE interview_id = i.id ORDER BY at DESC LIMIT 1
         ) AS last_reply ON TRUE
        WHERE i.candidate_id = $1 AND i.status = 'scheduled'
        ORDER BY i.scheduled_at`,
      [candidateId],
    );

    return {
      firstName: who.full_name.split(" ")[0]!,
      roleTitle: who.role_title,
      rounds: rows.map((r) => ({
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
    };
  });
}

/**
 * What they said on the call, written down.
 *
 * Same refusals as the page: a reschedule needs a reason, and nothing here
 * moves the interview. The agent asks; HR reschedules. An agent that could
 * rewrite four people's afternoons on the strength of a phone call that was
 * authenticated by a spoken name would be a bad idea wearing a good one.
 */
export async function replyOnCall(
  callId: string,
  interviewId: string,
  response: RoundResponse,
  note: string | null,
): Promise<void> {
  const { candidateId, onBehalfOf } = await openCall(callId);

  const reason = (note ?? "").trim();
  if (response === "reschedule_requested" && !reason) {
    throw new BlockingRuleError(
      "Ask them what would work better, and send that with the request.",
    );
  }

  await withCandidateContext(candidateId, async (q) => {
    const [round] = await q<{ id: string; status: string }>(
      "SELECT id, status FROM hr.interviews WHERE id = $1 AND candidate_id = $2",
      [interviewId, candidateId],
    );
    if (!round) throw new NotFoundError("No such interview.");
    if (round.status !== "scheduled") {
      throw new BlockingRuleError("That round is no longer in the diary.");
    }
    await q(
      `INSERT INTO hr.interview_responses (interview_id, response, note)
       VALUES ($1, $2, NULLIF($3, ''))`,
      [interviewId, response, reason],
    );
  });

  // Both names, always: the machine that took it and the person it was for.
  // `user_id` stays NULL because a member of staff did not say this — the
  // candidate did, and `on_behalf_of` is who the call was made for.
  await query(
    `INSERT INTO hr.candidate_activity
       (candidate_id, user_id, what, detail, via, on_behalf_of)
     VALUES ($1, NULL, $2, $3, 'voice_agent', $4)`,
    [
      candidateId,
      response === "confirmed"
        ? "confirmed their round by phone"
        : "asked to move their round, by phone",
      reason || null,
      onBehalfOf,
    ],
  );

  await writeAudit({
    action: "HIRING_VOICE_REPLY",
    resourceType: "hiring",
    resourceId: candidateId,
    newValues: { callId, interviewId, response, onBehalfOf },
  });
}

/** Hang up. Idempotent — a call that is already closed closes fine. */
export async function closeCall(callId: string): Promise<void> {
  await query(
    `UPDATE hr.voice_calls
        SET status = 'closed', closed_at = NOW()
      WHERE id = $1 AND status IN ('identifying', 'open')`,
    [callId],
  );
}
