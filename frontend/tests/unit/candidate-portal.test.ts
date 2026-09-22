import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * S11 · The candidate's own page (db/056).
 *
 * SCOPE OF THIS FILE. The fence that matters most here — which rows a token
 * opens — is RLS, and it is proven against real SQL in db/validate.mjs ("the
 * candidate's link opens their own round and nothing else", "the candidate
 * never reads a scorecard about themselves"). Postgres is the thing that
 * enforces it and Postgres is where it is tested.
 *
 * What is tested HERE is the half Postgres cannot do:
 *
 *   · the columns. RLS opens the candidate's own row, and that row carries
 *     what they earn now and what they are asking for. Only the service keeps
 *     those off the page, so there is a test that the query naming them never
 *     runs on this path.
 *
 *   · the refusals, in the words they are refused in.
 *
 *   · that a finished candidate's link is dead even while the invite itself
 *     is live, which is a rule in TypeScript and nowhere else.
 */

const { queryMock, auditMock, canMock, rateLimitMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  auditMock: vi.fn(),
  canMock: vi.fn(),
  rateLimitMock: vi.fn(),
}));

/* Both contexts route to the same mock, and every SQL string they are handed
   is recorded — which is what lets the money test below assert on the shape
   of the query rather than on its result. */
vi.mock("@/lib/db", () => ({
  query: queryMock,
  withUserContext: async (_user: unknown, fn: (q: unknown) => unknown) => fn(queryMock),
  withCandidateContext: async (_id: string, fn: (q: unknown) => unknown) => fn(queryMock),
}));
vi.mock("@/lib/services/audit", () => ({ writeAudit: auditMock }));
vi.mock("@/lib/security/rate-limit", () => ({ rateLimit: rateLimitMock }));
vi.mock("@/lib/services/permissions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/permissions")>();
  return { ...actual, can: canMock };
});

import {
  issueInvite,
  openCandidatePage,
  respondToRound,
  uploadDocument,
} from "@/lib/services/candidate-portal";
import { BlockingRuleError, NotFoundError } from "@/lib/services/blocking";
import { PermissionError } from "@/lib/services/permissions";

type Row = Record<string, unknown>;
type Handler = { match: RegExp; rows: Row[] | ((params: unknown[]) => Row[]) };

function routes(...handlers: Handler[]) {
  queryMock.mockImplementation(async (sql: string, params: unknown[] = []) => {
    for (const h of handlers) {
      if (h.match.test(sql)) return typeof h.rows === "function" ? h.rows(params) : h.rows;
    }
    return [];
  });
}

/** Every SQL string the service ran, for asserting on what it did not ask for. */
function sqlRun(): string[] {
  return queryMock.mock.calls.map((c) => String(c[0]));
}

const hr = {
  id: "00000000-0000-4000-8000-00000000000d",
  name: "Dev HR Lead",
  accessLevel: "L2" as const,
  departmentId: "00000000-0000-4000-8000-00000000d011",
};

const CANDIDATE = "00000000-0000-4000-8000-00000000c201";
const INTERVIEW = "00000000-0000-4000-8000-00000000c301";
const TOKEN = "a-token-that-the-mock-will-accept";

/** The token lookup succeeding, for a candidate who is still moving. */
function liveToken(status = "active"): Handler {
  return {
    match: /FROM hr\.candidate_invites i/,
    rows: [{ candidate_id: CANDIDATE, invite_id: "inv-1", status }],
  };
}

const THE_PAGE: Handler = {
  match: /FROM hr\.candidates c/,
  rows: [
    {
      full_name: "Aarti Sethi",
      role_title: "Junior Draughtsman",
      stage_label: "Department round",
    },
  ],
};

const NO_ROUNDS: Handler = { match: /FROM hr\.interviews i/, rows: [] };
const NO_DOCS: Handler = { match: /FROM hr\.candidate_documents/, rows: [] };

const SCHEDULED_ROUND: Handler = {
  match: /SELECT id, status FROM hr\.interviews/,
  rows: [{ id: INTERVIEW, status: "scheduled" }],
};

beforeEach(() => {
  queryMock.mockReset();
  auditMock.mockReset();
  canMock.mockReset();
  rateLimitMock.mockReset();
  canMock.mockResolvedValue({ allowed: true, scope: "all", source: "department" });
  rateLimitMock.mockReturnValue({ allowed: true, remaining: 9, retryAfterSeconds: 0 });
});

describe("what the page may read", () => {
  it("never asks for what the candidate earns or is asking for", async () => {
    routes(liveToken(), THE_PAGE, NO_ROUNDS, NO_DOCS);
    await openCandidatePage(TOKEN, null);

    // A negative assertion over an empty list proves nothing, so the list
    // is checked first.
    expect(sqlRun().length).toBeGreaterThan(0);

    // The one rule RLS cannot keep. If somebody adds a SELECT * here, or
    // reaches for the money "just to show them the offer", this fails.
    for (const sql of sqlRun()) {
      expect(sql).not.toMatch(/current_ctc|expected_ctc/);
      expect(sql).not.toMatch(/SELECT \*/);
    }
  });

  it("never touches the scorecards or the trail", async () => {
    routes(liveToken(), THE_PAGE, NO_ROUNDS, NO_DOCS);
    await openCandidatePage(TOKEN, null);

    expect(sqlRun().length).toBeGreaterThan(0);
    for (const sql of sqlRun()) {
      expect(sql).not.toMatch(/hr\.scorecards|hr\.scorecard_answers/);
      // The trail is written to on reply, but never read on this path.
      expect(sql).not.toMatch(/SELECT[\s\S]*FROM hr\.candidate_activity/);
    }
  });

  it("shows the round, who is in it, and the candidate's own last word", async () => {
    routes(liveToken(), THE_PAGE, NO_DOCS, {
      match: /FROM hr\.interviews i/,
      rows: [
        {
          id: INTERVIEW,
          stage_label: "Department round",
          scheduled_at: new Date("2026-09-23T06:00:00Z"),
          duration_mins: 45,
          mode: "in_person",
          location: "NH8 — meeting room 2",
          status: "scheduled",
          meeting: ["Dev HOD", "Dev HR"],
          reply_response: "confirmed",
          reply_note: null,
          reply_at: new Date("2026-09-20T09:00:00Z"),
        },
      ],
    });

    const view = await openCandidatePage(TOKEN, null);
    expect(view?.fullName).toBe("Aarti Sethi");
    expect(view?.rounds).toHaveLength(1);
    expect(view?.rounds[0]!.meeting).toEqual(["Dev HOD", "Dev HR"]);
    expect(view?.rounds[0]!.reply?.response).toBe("confirmed");
  });
});

describe("when the link stops working", () => {
  it("gives nothing for a token that matches nothing", async () => {
    routes({ match: /FROM hr\.candidate_invites i/, rows: [] });
    expect(await openCandidatePage(TOKEN, null)).toBeNull();
  });

  it("gives nothing once the candidate has been rejected, invite or not", async () => {
    // The invite row itself is live — unrevoked and unexpired. This is the
    // rule that lives only in TypeScript, so this is the only place it is
    // proven.
    routes(liveToken("rejected"), THE_PAGE, NO_ROUNDS, NO_DOCS);
    expect(await openCandidatePage(TOKEN, null)).toBeNull();
  });

  it("gives nothing for a hired candidate too", async () => {
    routes(liveToken("hired"), THE_PAGE, NO_ROUNDS, NO_DOCS);
    expect(await openCandidatePage(TOKEN, null)).toBeNull();
  });

  it("refuses an absurdly long token without going near the database", async () => {
    routes(liveToken());
    expect(await openCandidatePage("x".repeat(500), null)).toBeNull();
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("refuses when the caller is going too fast", async () => {
    rateLimitMock.mockReturnValue({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 42,
    });
    await expect(openCandidatePage(TOKEN, "1.2.3.4")).rejects.toThrow(/42 seconds/);
  });
});

describe("replying to a round", () => {
  it("takes a confirmation", async () => {
    routes(liveToken(), SCHEDULED_ROUND);
    await respondToRound(TOKEN, INTERVIEW, "confirmed", null, null);

    const insert = sqlRun().find((s) => /INSERT INTO hr\.interview_responses/.test(s));
    expect(insert).toBeDefined();
  });

  it("will not take a reschedule with no reason", async () => {
    routes(liveToken(), SCHEDULED_ROUND);
    await expect(
      respondToRound(TOKEN, INTERVIEW, "reschedule_requested", "   ", null),
    ).rejects.toBeInstanceOf(BlockingRuleError);
  });

  it("refuses a round that is no longer in the diary", async () => {
    routes(liveToken(), {
      match: /SELECT id, status FROM hr\.interviews/,
      rows: [{ id: INTERVIEW, status: "cancelled" }],
    });
    await expect(
      respondToRound(TOKEN, INTERVIEW, "confirmed", null, null),
    ).rejects.toBeInstanceOf(BlockingRuleError);
  });

  it("refuses an interview id that is not theirs", async () => {
    // RLS would already return nothing; the service names the candidate in
    // the WHERE as well, so a widened policy is not on its own enough.
    routes(liveToken(), { match: /SELECT id, status FROM hr\.interviews/, rows: [] });
    await expect(
      respondToRound(TOKEN, INTERVIEW, "confirmed", null, null),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("records the reply as the candidate's, not a member of staff's", async () => {
    routes(liveToken(), SCHEDULED_ROUND);
    await respondToRound(TOKEN, INTERVIEW, "confirmed", null, null);

    const trail = queryMock.mock.calls.find((c) =>
      /INSERT INTO hr\.candidate_activity/.test(String(c[0])),
    );
    expect(trail).toBeDefined();
    // user_id NULL is what says "this was them". A staff id here would put a
    // colleague's name against something a candidate did.
    expect((trail![1] as unknown[])[0]).toBe(CANDIDATE);
    expect(String(trail![0])).toMatch(/VALUES \(\$1, NULL,/);
  });
});

describe("sending a CV", () => {
  const pdf = {
    filename: "aarti-sethi-cv.pdf",
    mime: "application/pdf",
    bytes: Buffer.from("%PDF-1.4 pretend"),
  };

  it("takes a PDF", async () => {
    routes(liveToken());
    await uploadDocument(TOKEN, pdf, "resume", null);
    expect(sqlRun().some((s) => /INSERT INTO hr\.candidate_documents/.test(s))).toBe(true);
  });

  it("refuses anything that is not a PDF or a Word file", async () => {
    routes(liveToken());
    await expect(
      uploadDocument(
        TOKEN,
        { ...pdf, filename: "cv.html", mime: "text/html" },
        "resume",
        null,
      ),
    ).rejects.toBeInstanceOf(BlockingRuleError);
  });

  it("refuses a file that is too big", async () => {
    routes(liveToken());
    await expect(
      uploadDocument(
        TOKEN,
        { ...pdf, bytes: Buffer.alloc(6 * 1024 * 1024) },
        "resume",
        null,
      ),
    ).rejects.toBeInstanceOf(BlockingRuleError);
  });

  it("keeps a path out of the stored filename", async () => {
    routes(liveToken());
    await uploadDocument(
      TOKEN,
      { ...pdf, filename: "../../etc/passwd.pdf" },
      "resume",
      null,
    );
    const insert = queryMock.mock.calls.find((c) =>
      /INSERT INTO hr\.candidate_documents/.test(String(c[0])),
    );
    expect((insert![1] as unknown[])[2]).toBe("passwd.pdf");
  });

  it("replaces the candidate's last CV rather than stacking them up", async () => {
    routes(liveToken());
    await uploadDocument(TOKEN, pdf, "resume", null);
    expect(sqlRun().some((s) => /DELETE FROM hr\.candidate_documents/.test(s))).toBe(true);
  });
});

describe("issuing the link", () => {
  const CANDIDATE_ROW: Handler = {
    match: /SELECT full_name, email, status FROM hr\.candidates/,
    rows: [{ full_name: "Aarti Sethi", email: "aarti@example.com", status: "active" }],
  };
  const INSERTED: Handler = {
    match: /INSERT INTO hr\.candidate_invites/,
    rows: [{ expires_at: new Date("2026-10-13T00:00:00Z") }],
  };

  it("hands the token back exactly once and never stores it", async () => {
    routes(CANDIDATE_ROW, INSERTED);
    const issued = await issueInvite(hr, CANDIDATE);

    expect(issued.token).toHaveLength(43); // 32 bytes, base64url
    expect(issued.url).toContain(issued.token);

    // What went into the database is the hash, not the token.
    const insert = queryMock.mock.calls.find((c) =>
      /INSERT INTO hr\.candidate_invites/.test(String(c[0])),
    );
    const stored = (insert![1] as string[])[1]!;
    expect(stored).toHaveLength(64);
    expect(stored).not.toContain(issued.token);

    // And the token is not in the audit trail either.
    expect(JSON.stringify(auditMock.mock.calls)).not.toContain(issued.token);
  });

  it("withdraws the previous link in the same breath", async () => {
    routes(CANDIDATE_ROW, INSERTED);
    await issueInvite(hr, CANDIDATE);
    expect(sqlRun().some((s) => /UPDATE hr\.candidate_invites[\s\S]*revoked_at/.test(s))).toBe(
      true,
    );
  });

  it("refuses to send a page to somebody already rejected", async () => {
    routes(
      {
        match: /SELECT full_name, email, status FROM hr\.candidates/,
        rows: [{ full_name: "Aarti Sethi", email: "a@example.com", status: "rejected" }],
      },
      INSERTED,
    );
    await expect(issueInvite(hr, CANDIDATE)).rejects.toBeInstanceOf(BlockingRuleError);
  });

  it("is its own permission, not a corner of hr_access", async () => {
    canMock.mockImplementation(async (_u: unknown, action: string) => ({
      allowed: action === "hr_access",
      scope: "all",
      source: "global",
    }));
    routes(CANDIDATE_ROW, INSERTED);
    await expect(issueInvite(hr, CANDIDATE)).rejects.toBeInstanceOf(PermissionError);
  });
});
