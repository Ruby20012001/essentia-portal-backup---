import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * S11 · The voice agent (db/057).
 *
 * THE ONLY THING THAT REALLY MATTERS IN THIS FILE is that nothing about a
 * candidate comes back before somebody has proved who they are, and that the
 * proof is not trivially guessable. A phone call has no token; this is what
 * stands in for one, so it is tested harder than the rest of the module.
 *
 * The name matcher gets its own block because it is the whole fence and it is
 * pure — no database, no mocks, just "would this have let the wrong person
 * in".
 */

const { queryMock, auditMock, canMock, rateLimitMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  auditMock: vi.fn(),
  canMock: vi.fn(),
  rateLimitMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  query: queryMock,
  withUserContext: async (_u: unknown, fn: (q: unknown) => unknown) => fn(queryMock),
  withCandidateContext: async (_id: string, fn: (q: unknown) => unknown) => fn(queryMock),
}));
vi.mock("@/lib/services/audit", () => ({ writeAudit: auditMock }));
vi.mock("@/lib/security/rate-limit", () => ({ rateLimit: rateLimitMock }));
vi.mock("@/lib/services/permissions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/permissions")>();
  return { ...actual, can: canMock };
});

import {
  agentAuthenticated,
  identifyCaller,
  nameMatches,
  replyOnCall,
  roundsForCall,
  startCall,
} from "@/lib/services/voice-agent";
import { BlockingRuleError, NotFoundError } from "@/lib/services/blocking";

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

const CALL = "00000000-0000-4000-8000-00000000e001";
const CANDIDATE = "00000000-0000-4000-8000-00000000c201";
const INTERVIEW = "00000000-0000-4000-8000-00000000c301";
const STAFF = "00000000-0000-4000-8000-00000000000d";

const THE_STAFF: Handler = {
  match: /FROM public\.users WHERE lower\(email\)/,
  rows: [
    {
      id: STAFF,
      display_name: "Shruti",
      full_name: "Shruti Rao",
      access_level: "L2",
      department_id: "00000000-0000-4000-8000-00000000d011",
      is_active: true,
    },
  ],
};

function theCall(over: Partial<Row> = {}): Handler {
  return {
    match: /FROM hr\.voice_calls WHERE id/,
    rows: [
      {
        id: CALL,
        phone: "9810011122",
        status: "identifying",
        attempts: 0,
        expired: false,
        candidate_id: null,
        on_behalf_of: STAFF,
        ...over,
      },
    ],
  };
}

const ON_THAT_NUMBER: Handler = {
  match: /FROM hr\.candidates c\s+WHERE regexp_replace/,
  rows: [{ id: CANDIDATE, full_name: "Aarti Sethi" }],
};

beforeEach(() => {
  queryMock.mockReset();
  auditMock.mockReset();
  canMock.mockReset();
  rateLimitMock.mockReset();
  canMock.mockResolvedValue({ allowed: true, scope: "all", source: "department" });
  rateLimitMock.mockReturnValue({ allowed: true, remaining: 4, retryAfterSeconds: 0 });
  process.env.VOICE_AGENT_API_KEY = "k".repeat(40);
});

afterEach(() => {
  delete process.env.VOICE_AGENT_API_KEY;
});

describe("the agent proving it is the agent", () => {
  it("accepts the configured key", () => {
    expect(agentAuthenticated("k".repeat(40))).toBe(true);
  });

  it("refuses a wrong key, a prefix of it, and nothing at all", () => {
    expect(agentAuthenticated("k".repeat(39))).toBe(false);
    expect(agentAuthenticated("wrong")).toBe(false);
    expect(agentAuthenticated(null)).toBe(false);
    expect(agentAuthenticated("")).toBe(false);
  });

  it("is OFF rather than open when no key is configured", () => {
    // The failure mode that matters: a deployment with no voice agent must
    // refuse every call, not accept every call.
    delete process.env.VOICE_AGENT_API_KEY;
    expect(agentAuthenticated("anything")).toBe(false);
    expect(agentAuthenticated(null)).toBe(false);
  });

  it("refuses a key too short to be worth anything", () => {
    process.env.VOICE_AGENT_API_KEY = "short";
    expect(agentAuthenticated("short")).toBe(false);
  });
});

describe("matching what the caller said", () => {
  it("accepts the full name, however it is wrapped", () => {
    expect(nameMatches("Aarti Sethi", "Aarti Sethi")).toBe(true);
    expect(nameMatches("yes this is Aarti Sethi speaking", "Aarti Sethi")).toBe(true);
    expect(nameMatches("  aarti   sethi  ", "Aarti Sethi")).toBe(true);
    expect(nameMatches("Sethi, Aarti", "Aarti Sethi")).toBe(true);
  });

  it("forgives one character a word, because this came out of speech", () => {
    expect(nameMatches("Aarti Sethy", "Aarti Sethi")).toBe(true);
    expect(nameMatches("Arti Sethi", "Aarti Sethi")).toBe(true);
  });

  it("REFUSES a first name on its own", () => {
    // The point of the fence. A first name is a guess anybody could make,
    // and the agent can simply ask for the surname.
    expect(nameMatches("Aarti", "Aarti Sethi")).toBe(false);
    expect(nameMatches("it's Aarti", "Aarti Sethi")).toBe(false);
  });

  it("refuses a different person and a near-miss surname", () => {
    expect(nameMatches("Priya Sharma", "Aarti Sethi")).toBe(false);
    expect(nameMatches("Aarti Verma", "Aarti Sethi")).toBe(false);
    expect(nameMatches("Aarti Sharma", "Aarti Sethi")).toBe(false);
  });

  it("refuses nothing, and refuses noise", () => {
    expect(nameMatches("", "Aarti Sethi")).toBe(false);
    expect(nameMatches("   ", "Aarti Sethi")).toBe(false);
    expect(nameMatches("hello", "Aarti Sethi")).toBe(false);
    expect(nameMatches("Aarti Sethi", "")).toBe(false);
  });

  it("cannot be opened by reading every word in the dictionary at it", () => {
    // Belt and braces: a spoken string stuffed with candidate first names
    // still needs the surname.
    expect(nameMatches("aarti priya neha kavya rahul", "Aarti Sethi")).toBe(false);
  });
});

describe("starting a call", () => {
  it("says who it is and whose behalf it is on, before anything else", async () => {
    routes(THE_STAFF, { match: /INSERT INTO hr\.voice_calls/, rows: [{ id: CALL }] });
    const started = await startCall({
      phone: "+91 98100 11122",
      direction: "outbound",
      onBehalfOf: "shruti@essentia.in",
    });

    expect(started.callId).toBe(CALL);
    expect(started.say).toContain("essentia hiring assistant");
    expect(started.say).toContain("Shruti");
    // It asks rather than tells. This is the difference between a
    // confirmation and a giveaway.
    expect(started.say).toMatch(/could you tell me your full name/i);
  });

  it("gives away nothing about whether the number is known to us", async () => {
    routes(THE_STAFF, { match: /INSERT INTO hr\.voice_calls/, rows: [{ id: CALL }] });
    const started = await startCall({
      phone: "9999999999",
      direction: "outbound",
      onBehalfOf: "shruti@essentia.in",
    });
    expect(started.callId).toBeTruthy();
    expect(JSON.stringify(started)).not.toMatch(/Aarti|candidate|unknown/i);
  });

  it("will not act for somebody who could not do it themselves", async () => {
    canMock.mockResolvedValue({ allowed: false, scope: "all", source: "default_deny" });
    routes(THE_STAFF);
    await expect(
      startCall({ phone: "9810011122", direction: "outbound", onBehalfOf: "x@essentia.in" }),
    ).rejects.toBeInstanceOf(BlockingRuleError);
  });

  it("will not act for a dormant account", async () => {
    routes({
      match: /FROM public\.users WHERE lower\(email\)/,
      rows: [{ ...(THE_STAFF.rows as Row[])[0], is_active: false }],
    });
    await expect(
      startCall({ phone: "9810011122", direction: "outbound", onBehalfOf: "x@essentia.in" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("throttles a number being worked through a list", async () => {
    rateLimitMock.mockReturnValue({ allowed: false, remaining: 0, retryAfterSeconds: 300 });
    routes(THE_STAFF);
    await expect(
      startCall({ phone: "9810011122", direction: "outbound", onBehalfOf: "x@essentia.in" }),
    ).rejects.toThrow(/300 seconds/);
  });
});

describe("identifying the caller", () => {
  it("opens the call when the name matches", async () => {
    routes(theCall(), ON_THAT_NUMBER);
    const result = await identifyCaller(CALL, "Aarti Sethi");

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.candidateId).toBe(CANDIDATE);
    const update = queryMock.mock.calls.find((c) =>
      /SET candidate_id = \$2, status = 'open'/.test(String(c[0])),
    );
    expect(update).toBeDefined();
  });

  it("does not open it on a first name", async () => {
    routes(theCall(), ON_THAT_NUMBER);
    const result = await identifyCaller(CALL, "Aarti");
    expect(result.ok).toBe(false);
  });

  it("says exactly the same thing for a wrong name as for an unknown number", async () => {
    routes(theCall(), ON_THAT_NUMBER);
    const wrongName = await identifyCaller(CALL, "Priya Sharma");

    routes(theCall(), { match: /FROM hr\.candidates c\s+WHERE regexp_replace/, rows: [] });
    const unknownNumber = await identifyCaller(CALL, "Priya Sharma");

    // Two different reasons, one sentence. Otherwise the pair of them is an
    // oracle for "is this number one of yours".
    expect(wrongName).toEqual(unknownNumber);
  });

  it("burns the call after three tries", async () => {
    routes(theCall({ attempts: 2 }), ON_THAT_NUMBER);
    const result = await identifyCaller(CALL, "Nobody At All");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.triesLeft).toBe(0);
    const update = queryMock.mock.calls.find((c) =>
      /status = CASE WHEN \$2 >= 3 THEN 'failed'/.test(String(c[0])),
    );
    expect(update).toBeDefined();
    expect((update![1] as unknown[])[1]).toBe(3);
  });

  it("never writes down a name that did not match", async () => {
    routes(theCall(), ON_THAT_NUMBER);
    await identifyCaller(CALL, "Someone Elses Name");
    // If it was not our candidate's name it is a stranger's, and none of our
    // business to keep.
    expect(JSON.stringify(auditMock.mock.calls)).not.toMatch(/Someone|Elses/i);
  });

  it("refuses an expired call and one that is already open", async () => {
    routes(theCall({ expired: true }), ON_THAT_NUMBER);
    await expect(identifyCaller(CALL, "Aarti Sethi")).rejects.toBeInstanceOf(
      BlockingRuleError,
    );

    routes(theCall({ status: "open" }), ON_THAT_NUMBER);
    await expect(identifyCaller(CALL, "Aarti Sethi")).rejects.toBeInstanceOf(
      BlockingRuleError,
    );
  });

  it("only ever considers candidates who are still moving", async () => {
    routes(theCall(), ON_THAT_NUMBER);
    await identifyCaller(CALL, "Aarti Sethi");
    const lookup = queryMock.mock.calls.find((c) =>
      /FROM hr\.candidates c\s+WHERE regexp_replace/.test(String(c[0])),
    );
    expect(String(lookup![0])).toMatch(/status IN \('active', 'offered'\)/);
  });
});

describe("what an unidentified call may reach", () => {
  const NOT_YET = theCall({ status: "identifying", candidate_id: null });

  it("refuses to read the rounds", async () => {
    routes(NOT_YET);
    await expect(roundsForCall(CALL)).rejects.toBeInstanceOf(BlockingRuleError);
  });

  it("refuses to write a reply", async () => {
    routes(NOT_YET);
    await expect(
      replyOnCall(CALL, INTERVIEW, "confirmed", null),
    ).rejects.toBeInstanceOf(BlockingRuleError);
  });

  it("refuses both once the call has expired, even though it was identified", async () => {
    routes(theCall({ status: "open", candidate_id: CANDIDATE, expired: true }));
    await expect(roundsForCall(CALL)).rejects.toBeInstanceOf(BlockingRuleError);
    await expect(
      replyOnCall(CALL, INTERVIEW, "confirmed", null),
    ).rejects.toBeInstanceOf(BlockingRuleError);
  });
});

describe("an open call", () => {
  const OPEN = theCall({ status: "open", candidate_id: CANDIDATE });
  const WHO: Handler = {
    match: /SELECT c\.full_name, r\.title/,
    rows: [{ full_name: "Aarti Sethi", role_title: "Junior Draughtsman" }],
  };
  const SCHEDULED: Handler = {
    match: /SELECT id, status FROM hr\.interviews/,
    rows: [{ id: INTERVIEW, status: "scheduled" }],
  };

  it("reads the rounds without going near the money or the scorecards", async () => {
    routes(OPEN, WHO, { match: /FROM hr\.interviews i/, rows: [] });
    await roundsForCall(CALL);

    const sql = queryMock.mock.calls.map((c) => String(c[0]));
    expect(sql.length).toBeGreaterThan(0);
    for (const s of sql) {
      expect(s).not.toMatch(/current_ctc|expected_ctc/);
      expect(s).not.toMatch(/hr\.scorecards/);
    }
  });

  it("puts both names in the trail — the machine and the person it was for", async () => {
    routes(OPEN, SCHEDULED);
    await replyOnCall(CALL, INTERVIEW, "confirmed", null);

    const trail = queryMock.mock.calls.find((c) =>
      /INSERT INTO hr\.candidate_activity/.test(String(c[0])),
    );
    expect(trail).toBeDefined();
    const params = trail![1] as unknown[];
    expect(String(trail![0])).toMatch(/'voice_agent'/);
    expect(params[0]).toBe(CANDIDATE);
    expect(params[3]).toBe(STAFF); // on_behalf_of
    // user_id stays NULL: a member of staff did not say this, the candidate did.
    expect(String(trail![0])).toMatch(/VALUES \(\$1, NULL,/);
  });

  it("will not take a reschedule with no reason", async () => {
    routes(OPEN, SCHEDULED);
    await expect(
      replyOnCall(CALL, INTERVIEW, "reschedule_requested", "  "),
    ).rejects.toBeInstanceOf(BlockingRuleError);
  });

  it("cannot reply to a round that is not this candidate's", async () => {
    routes(OPEN, { match: /SELECT id, status FROM hr\.interviews/, rows: [] });
    await expect(
      replyOnCall(CALL, INTERVIEW, "confirmed", null),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("has no way at all to move a round", async () => {
    // Not a behaviour test — a shape test. If somebody adds an UPDATE to
    // hr.interviews in this service, this fails and they have to come and
    // argue for it.
    const source = await import("node:fs").then((fs) =>
      fs.readFileSync("lib/services/voice-agent.ts", "utf8"),
    );
    expect(source).not.toMatch(/UPDATE hr\.interviews/);
  });
});
