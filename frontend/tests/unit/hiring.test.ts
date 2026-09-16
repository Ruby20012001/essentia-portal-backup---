import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * S11 · Hiring and interviews (Brief §32, §36).
 *
 * SCOPE OF THIS FILE. The module is DB-backed, so these are unit tests of the
 * TypeScript contract: which refusals fire and in exactly what words, that a
 * submitted scorecard is one-way, and that sitting on a panel is its own
 * permission rather than a corner of hr_access.
 *
 * Row visibility itself lives in RLS and is proven against real PostgreSQL in
 * db/validate.mjs — "RLS opens a panel member's own round and nothing else",
 * "RLS opens the whole board to HR, by department", "RLS shows a stranger
 * nothing at all".
 */

const { queryMock, auditMock, canMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  auditMock: vi.fn(),
  canMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  query: queryMock,
  // withUserContext hands the service a query fn; route it to the same mock.
  withUserContext: async (_user: unknown, fn: (q: unknown) => unknown) => fn(queryMock),
}));
vi.mock("@/lib/services/audit", () => ({ writeAudit: auditMock }));
vi.mock("@/lib/services/permissions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/permissions")>();
  return { ...actual, can: canMock };
});

import {
  addCandidate,
  decideCandidate,
  hiringRights,
  moveCandidate,
  saveScorecard,
  scheduleInterview,
} from "@/lib/services/hiring";
import { BlockingRuleError } from "@/lib/services/blocking";
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

const hr = {
  id: "00000000-0000-4000-8000-00000000000d",
  name: "Dev HR Lead",
  accessLevel: "L2" as const,
  departmentId: "00000000-0000-4000-8000-00000000d011",
};

const CANDIDATE = "00000000-0000-4000-8000-00000000c201";
const INTERVIEW = "00000000-0000-4000-8000-00000000c301";
const QUESTION = "00000000-0000-4000-8000-00000000c111";

const STAGES: Handler = {
  match: /FROM hr\.interview_stages/,
  rows: [
    { code: "hr_screen", label: "HR conversation", seq: 20, is_final: false, description: null },
    { code: "department", label: "Department round", seq: 30, is_final: false, description: null },
    { code: "offer", label: "Offer", seq: 60, is_final: true, description: null },
  ],
};

const ON_THE_PANEL: Handler = { match: /FROM hr\.interview_panel/, rows: [{ one: 1 }] };

function candidateRow(over: Partial<Row> = {}): Handler {
  return {
    match: /SELECT stage, status, full_name FROM hr\.candidates/,
    rows: [{ stage: "hr_screen", status: "active", full_name: "Aarti Sethi", ...over }],
  };
}

function owed(n: number): Handler {
  return { match: /COUNT\(\*\) AS owed/, rows: [{ owed: String(n) }] };
}

beforeEach(() => {
  queryMock.mockReset();
  auditMock.mockReset();
  canMock.mockReset();
  canMock.mockResolvedValue({ allowed: true, scope: "all", source: "department" });
});

describe("the door", () => {
  it("gives HR the board, the right to add and the right to decide", async () => {
    expect(await hiringRights(hr)).toEqual({ see: true, add: true, decide: true });
  });

  it("a reader who cannot open the module can do nothing inside it", async () => {
    // hr_access denied; create/edit would be allowed on their own. Neither
    // should survive: you cannot add to a board you may not look at.
    canMock.mockImplementation(async (_u: unknown, action: string) => ({
      allowed: action !== "hr_access",
      scope: "own_dept",
      source: "global",
    }));
    expect(await hiringRights(hr)).toEqual({ see: false, add: false, decide: false });
  });

  it("refuses the board to somebody without hr_access", async () => {
    canMock.mockResolvedValue({ allowed: false, scope: "own_dept", source: "default_deny" });
    await expect(
      addCandidate(hr, { roleId: CANDIDATE, fullName: "Someone", email: "a@b.in" }),
    ).rejects.toBeInstanceOf(PermissionError);
  });
});

describe("adding somebody to the board", () => {
  it("refuses a candidate nobody can reach", async () => {
    routes();
    await expect(
      addCandidate(hr, { roleId: CANDIDATE, fullName: "Aarti Sethi" }),
    ).rejects.toThrow(/email address or a phone number/);
  });

  it("refuses a candidate with no name", async () => {
    routes();
    await expect(
      addCandidate(hr, { roleId: CANDIDATE, fullName: "  ", email: "a@b.in" }),
    ).rejects.toThrow(/needs a name/);
  });

  it("refuses to add anybody to a seat that is already filled", async () => {
    routes({
      match: /SELECT status, title FROM hr\.open_roles/,
      rows: [{ status: "filled", title: "Junior Draughtsman" }],
    });
    await expect(
      addCandidate(hr, { roleId: CANDIDATE, fullName: "Aarti Sethi", email: "a@b.in" }),
    ).rejects.toThrow(/is filled\. Reopen the seat/);
  });
});

describe("moving somebody on", () => {
  it("refuses while an interviewer still owes a write-up", async () => {
    routes(STAGES, candidateRow(), owed(3));
    await expect(moveCandidate(hr, CANDIDATE, "department")).rejects.toThrow(
      /3 interviewers have not written up a round that has already happened/,
    );
  });

  it("says it in the singular when it is one person", async () => {
    routes(STAGES, candidateRow(), owed(1));
    await expect(moveCandidate(hr, CANDIDATE, "department")).rejects.toThrow(
      /1 interviewer has not written up/,
    );
  });

  it("moves when every round that happened has been written up", async () => {
    routes(STAGES, candidateRow(), owed(0));
    await expect(moveCandidate(hr, CANDIDATE, "department")).resolves.toBeUndefined();
    const update = queryMock.mock.calls.find(([sql]) =>
      /UPDATE hr\.candidates SET stage/.test(String(sql)),
    );
    expect(update?.[1]).toEqual([CANDIDATE, "department"]);
  });

  it("refuses to move somebody who has stopped moving", async () => {
    routes(STAGES, candidateRow({ status: "rejected" }), owed(0));
    await expect(moveCandidate(hr, CANDIDATE, "department")).rejects.toThrow(
      /is rejected and is not moving through the pipeline/,
    );
  });

  it("refuses a stage that is not in the pipeline, and says where stages live", async () => {
    routes(STAGES);
    await expect(moveCandidate(hr, CANDIDATE, "vibes_check")).rejects.toThrow(
      /hr\.interview_stages/,
    );
  });

  it("refuses to move somebody to where they already are", async () => {
    routes(STAGES, candidateRow({ stage: "department" }), owed(0));
    await expect(moveCandidate(hr, CANDIDATE, "department")).rejects.toThrow(
      /already at Department round/,
    );
  });
});

describe("stopping somebody", () => {
  it("refuses a rejection with no reason", async () => {
    routes();
    await expect(decideCandidate(hr, CANDIDATE, "rejected")).rejects.toBeInstanceOf(
      BlockingRuleError,
    );
    await expect(decideCandidate(hr, CANDIDATE, "rejected", "   ")).rejects.toThrow(
      /Say why in a sentence/,
    );
  });

  it("needs no reason to hire somebody", async () => {
    routes({
      match: /SELECT status, stage, full_name FROM hr\.candidates/,
      rows: [{ status: "active", stage: "offer", full_name: "Aarti Sethi" }],
    });
    await expect(decideCandidate(hr, CANDIDATE, "hired")).resolves.toBeUndefined();
  });

  it("records the decision in the audit trail, with what it was before", async () => {
    routes({
      match: /SELECT status, stage, full_name FROM hr\.candidates/,
      rows: [{ status: "active", stage: "hr_screen", full_name: "Sana Qureshi" }],
    });
    await decideCandidate(hr, CANDIDATE, "rejected", "No site exposure at all.");
    expect(auditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "HIRING_DECISION",
        resourceType: "hiring",
        resourceId: CANDIDATE,
        oldValues: { status: "active", stage: "hr_screen" },
        newValues: {
          status: "rejected",
          stage: "hr_screen",
          note: "No site exposure at all.",
        },
      }),
    );
  });
});

describe("scheduling a round", () => {
  it("refuses a round with nobody sitting in it", async () => {
    routes(STAGES);
    await expect(
      scheduleInterview(hr, {
        candidateId: CANDIDATE,
        stageCode: "department",
        scheduledAt: "2026-09-20T11:30:00.000Z",
        panel: [],
      }),
    ).rejects.toThrow(/at least one person sitting in it/);
  });

  it("refuses a time that is not a time", async () => {
    routes(STAGES);
    await expect(
      scheduleInterview(hr, {
        candidateId: CANDIDATE,
        stageCode: "department",
        scheduledAt: "next tuesday-ish",
        panel: [hr.id],
      }),
    ).rejects.toThrow(/not a date and time/);
  });

  it("refuses to schedule anything for somebody who has stopped moving", async () => {
    routes(STAGES, {
      match: /SELECT status, full_name FROM hr\.candidates/,
      rows: [{ status: "withdrawn", full_name: "Rohit Menon" }],
    });
    await expect(
      scheduleInterview(hr, {
        candidateId: CANDIDATE,
        stageCode: "department",
        scheduledAt: "2026-09-20T11:30:00.000Z",
        panel: [hr.id],
      }),
    ).rejects.toThrow(/is withdrawn\. Nothing is scheduled/);
  });
});

describe("the scorecard", () => {
  it("is refused to somebody who was not in the room", async () => {
    routes({ match: /FROM hr\.interview_panel/, rows: [] });
    await expect(
      saveScorecard(hr, INTERVIEW, { recommendation: "yes", submit: true }),
    ).rejects.toBeInstanceOf(PermissionError);
  });

  it("cannot be submitted without a yes or a no", async () => {
    routes(ON_THE_PANEL);
    await expect(
      saveScorecard(hr, INTERVIEW, { strengths: "Good on paper", submit: true }),
    ).rejects.toThrow(/Say yes or no before you submit/);
  });

  it("saves as a draft without one", async () => {
    routes(ON_THE_PANEL, { match: /SELECT id, submitted_at FROM hr\.scorecards/, rows: [] });
    await expect(
      saveScorecard(hr, INTERVIEW, { strengths: "Good on paper" }),
    ).resolves.toEqual({ submitted: false });
  });

  it("refuses a rating off the scale", async () => {
    routes(ON_THE_PANEL);
    await expect(
      saveScorecard(hr, INTERVIEW, {
        answers: [{ questionId: QUESTION, rating: 5 }],
      }),
    ).rejects.toThrow(/rating runs from 1 to 4/);
  });

  it("is one way — a submitted one cannot be rewritten", async () => {
    routes(ON_THE_PANEL, {
      match: /SELECT id, submitted_at FROM hr\.scorecards/,
      rows: [{ id: "card", submitted_at: new Date("2026-09-09T10:00:00Z") }],
    });
    await expect(
      saveScorecard(hr, INTERVIEW, { recommendation: "no", submit: true }),
    ).rejects.toThrow(/before you heard what anybody else thought/);
  });

  it("writes the round up on the candidate's trail when it is submitted", async () => {
    routes(
      ON_THE_PANEL,
      { match: /SELECT id, submitted_at FROM hr\.scorecards/, rows: [] },
      { match: /INSERT INTO hr\.scorecards/, rows: [{ id: "card" }] },
      {
        match: /SELECT i\.candidate_id, s\.label/,
        rows: [{ candidate_id: CANDIDATE, label: "Department round" }],
      },
    );
    await saveScorecard(hr, INTERVIEW, { recommendation: "yes", submit: true });
    const trail = queryMock.mock.calls.find(([sql]) =>
      /INSERT INTO hr\.candidate_activity/.test(String(sql)),
    );
    expect(trail?.[1]).toEqual([CANDIDATE, hr.id, "wrote up Department round", "yes"]);
  });
});
