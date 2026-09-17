import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * S11 · Hiring and interviews (Brief §32, §36).
 *
 * SCOPE OF THIS FILE. The module is DB-backed, so these are unit tests of the
 * TypeScript contract: which refusals fire and in what words, what each
 * decision does alongside itself (calling rounds off, filling the seat, telling
 * the panel), and that sitting on a panel is its own permission.
 *
 * Row visibility lives in RLS and is proven against real PostgreSQL in
 * db/validate.mjs — including that a panel member outside HR may write their
 * own trail line, which is what used to make Submit fail for them.
 * The pure rules are pinned in hiring-logic.test.ts.
 */

const { queryMock, auditMock, canMock, publishMock, colleaguesMock, contextMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  auditMock: vi.fn(),
  canMock: vi.fn(),
  publishMock: vi.fn(),
  colleaguesMock: vi.fn(),
  contextMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  query: queryMock,
  // withUserContext hands the service a query fn; route it to the same mock,
  // and count the transactions so "one transaction" can be asserted.
  withUserContext: async (user: unknown, fn: (q: unknown) => unknown) => {
    contextMock(user);
    return fn(queryMock);
  },
}));
vi.mock("@/lib/services/audit", () => ({ writeAudit: auditMock }));
vi.mock("@/lib/notifications", () => ({ publishEvent: publishMock }));
vi.mock("@/lib/services/users", () => ({ searchColleagues: colleaguesMock }));
vi.mock("@/lib/services/permissions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/permissions")>();
  return { ...actual, can: canMock };
});

import {
  DuplicateCandidateError,
  NeedsConfirmationError,
  addCandidate,
  decideCandidate,
  excusePanelist,
  hiringNoticePayload,
  hiringRights,
  moveCandidate,
  openRole,
  saveScorecard,
  scheduleInterview,
  searchHiringColleagues,
  setInterviewStatus,
  setRoleStatus,
  updateInterview,
  updateRole,
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

function callsMatching(re: RegExp) {
  return queryMock.mock.calls.filter(([sql]) => re.test(String(sql)));
}

const hr = {
  id: "00000000-0000-4000-8000-00000000000d",
  name: "Dev HR Lead",
  accessLevel: "L2" as const,
  departmentId: "00000000-0000-4000-8000-00000000d011",
};
const HOD = "00000000-0000-4000-8000-00000000000e";

const ROLE = "00000000-0000-4000-8000-00000000c001";
const CANDIDATE = "00000000-0000-4000-8000-00000000c201";
const INTERVIEW = "00000000-0000-4000-8000-00000000c301";
const QUESTION = "00000000-0000-4000-8000-00000000c111";
const SET = "00000000-0000-4000-8000-00000000c101";

const PAST = new Date(Date.now() - 2 * 3600_000);
const FUTURE = new Date(Date.now() + 24 * 3600_000);

const STAGES: Handler = {
  match: /SELECT code, label, seq, is_final, description/,
  rows: [
    { code: "applied", label: "Applied", seq: 10, is_final: false, description: null },
    { code: "hr_screen", label: "HR conversation", seq: 20, is_final: false, description: null },
    { code: "department", label: "Department round", seq: 30, is_final: false, description: null },
    { code: "offer", label: "Offer", seq: 60, is_final: true, description: null },
  ],
};

function seat(over: Row = {}): Handler {
  return {
    match: /FROM hr\.open_roles r WHERE r\.id = \$1/,
    rows: [{ id: ROLE, title: "Junior Draughtsman", status: "open", headcount: 2, hired: "0", ...over }],
  };
}

function movingCandidate(over: Row = {}): Handler {
  return {
    match: /SELECT stage, status, full_name, role_id FROM hr\.candidates/,
    rows: [{ stage: "hr_screen", status: "active", full_name: "Aarti Sethi", role_id: ROLE, ...over }],
  };
}

function decidingCandidate(over: Row = {}): Handler {
  return {
    match: /SELECT status, stage, full_name, role_id FROM hr\.candidates/,
    rows: [{ status: "active", stage: "department", full_name: "Aarti Sethi", role_id: ROLE, ...over }],
  };
}

function owedBy(...names: string[]): Handler {
  return { match: /SELECT u\.full_name\s+FROM hr\.interviews i/, rows: names.map((full_name) => ({ full_name })) };
}

const ON_THE_PANEL: Handler = { match: /SELECT 1 AS one FROM hr\.interview_panel/, rows: [{ one: 1 }] };

function scorecardRound(over: Row = {}): Handler {
  return {
    match: /SELECT i\.status, i\.scheduled_at, i\.candidate_id, i\.question_set_id/,
    rows: [
      {
        status: "scheduled",
        scheduled_at: PAST,
        candidate_id: CANDIDATE,
        question_set_id: SET,
        stage_label: "Department round",
        ...over,
      },
    ],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  queryMock.mockReset();
  canMock.mockResolvedValue({ allowed: true, scope: "all", source: "department" });
  publishMock.mockResolvedValue({ event: {}, deduped: false });
});

/* ── the door ──────────────────────────────────────────────────────────── */

describe("the door", () => {
  it("gives HR the board, the right to add and the right to decide", async () => {
    expect(await hiringRights(hr)).toEqual({ see: true, add: true, decide: true });
  });

  it("a reader who cannot open the module can do nothing inside it", async () => {
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
      addCandidate(hr, { roleId: ROLE, fullName: "Someone", email: "a@b.in" }),
    ).rejects.toBeInstanceOf(PermissionError);
  });

  it("the panel picker includes the person searching — HR can sit in their own call", async () => {
    routes();
    colleaguesMock.mockResolvedValue([{ id: hr.id, name: hr.name, email: "dev.hr@essentia.in", jobTitle: null }]);
    const found = await searchHiringColleagues(hr, "dev hr");
    expect(colleaguesMock).toHaveBeenCalledWith("dev hr", null, 12);
    expect(found.map((u) => u.id)).toContain(hr.id);
  });
});

/* ── seats ─────────────────────────────────────────────────────────────── */

describe("a seat", () => {
  it("records employment type and hiring lead", async () => {
    routes(
      { match: /FROM public\.users WHERE id = \$1 AND is_active/, rows: [{ id: HOD }] },
      { match: /INSERT INTO hr\.open_roles/, rows: [{ id: ROLE }] },
    );
    await openRole(hr, { title: "Site Supervisor", employment: "contract", hiringLead: HOD, headcount: 1 });
    const [, params] = callsMatching(/INSERT INTO hr\.open_roles/)[0];
    expect(params).toEqual(["Site Supervisor", null, 1, null, "contract", HOD, null, hr.id]);
  });

  it("names the field that is too long instead of passing a database error through", async () => {
    routes();
    await expect(openRole(hr, { title: "x".repeat(201) })).rejects.toThrow(
      "The title is limited to 200 characters (this one is 201).",
    );
  });

  it("refuses an employment type or lead it does not recognise, in words", async () => {
    routes();
    await expect(
      openRole(hr, { title: "Intern", employment: "freelance" as never }),
    ).rejects.toThrow(/full-time, contract or intern/);
    await expect(openRole(hr, { title: "Intern", hiringLead: "not-a-uuid" })).rejects.toThrow(
      "That hiring lead is not recognised.",
    );
  });

  it("can be corrected, but not below the people already hired into it", async () => {
    routes(seat({ hired: "2" }));
    await expect(updateRole(hr, ROLE, { title: "Junior Draughtsman", headcount: 1 })).rejects.toThrow(
      /2 people are already hired into "Junior Draughtsman", so the headcount cannot be less than 2/,
    );
  });

  it("asks before closing a seat people are still moving on — and closes it once told yes", async () => {
    routes(seat(), { match: /COUNT\(\*\) AS moving/, rows: [{ moving: "2" }] });
    await expect(setRoleStatus(hr, ROLE, "closed")).rejects.toBeInstanceOf(NeedsConfirmationError);
    await expect(setRoleStatus(hr, ROLE, "closed")).rejects.toThrow(/2 people are still moving/);
    expect(callsMatching(/UPDATE hr\.open_roles SET status/)).toHaveLength(0);

    await setRoleStatus(hr, ROLE, "closed", { confirm: true });
    expect(callsMatching(/UPDATE hr\.open_roles SET status/)[0][1]).toEqual([ROLE, "closed"]);
  });
});

/* ── adding a candidate ────────────────────────────────────────────────── */

describe("adding somebody to the board", () => {
  it("refuses a candidate nobody can reach", async () => {
    routes();
    await expect(addCandidate(hr, { roleId: ROLE, fullName: "Aarti Sethi" })).rejects.toThrow(
      /email address or a phone number/,
    );
  });

  it("refuses a candidate with no name", async () => {
    routes();
    await expect(addCandidate(hr, { roleId: ROLE, fullName: "  ", email: "a@b.in" })).rejects.toThrow(
      /needs a name/,
    );
  });

  it("refuses to add anybody to a seat that is already filled", async () => {
    routes(seat({ status: "filled" }));
    await expect(
      addCandidate(hr, { roleId: ROLE, fullName: "Aarti Sethi", email: "a@b.in" }),
    ).rejects.toThrow(/is filled\. Reopen the seat/);
  });

  it("names an over-long field, and catches a salary typed in the wrong unit", async () => {
    routes();
    await expect(
      addCandidate(hr, { roleId: ROLE, fullName: "A", phone: "98100", source: "x".repeat(61) }),
    ).rejects.toThrow("Where they came from is limited to 60 characters (this one is 61).");
    await expect(
      addCandidate(hr, { roleId: ROLE, fullName: "A", phone: "98100", expectedCtc: 5 }),
    ).rejects.toThrow(/reads as ₹5 a year/);
  });

  it("stores a CV link that will actually open, and the current pay", async () => {
    routes(seat(), { match: /INSERT INTO hr\.candidates/, rows: [{ id: CANDIDATE }] });
    await addCandidate(hr, {
      roleId: ROLE,
      fullName: "Aarti Sethi",
      phone: "+91 98110 00001",
      currentCtc: 420_000,
      resumeUrl: "drive.google.com/file/d/abc/view",
    });
    const [, params] = callsMatching(/INSERT INTO hr\.candidates/)[0] as [string, unknown[]];
    expect(params[5]).toBe(420_000);
    expect(params[8]).toBe("https://drive.google.com/file/d/abc/view");
  });

  it("stops at somebody who has applied before, and says who and how it ended", async () => {
    routes(seat(), {
      match: /right\(regexp_replace/,
      rows: [
        {
          id: "00000000-0000-4000-8000-00000000c203",
          full_name: "Sana Qureshi",
          role_title: "Junior Draughtsman",
          status: "rejected",
          stage_label: "HR conversation",
          outcome_note: "No site exposure at all",
          created_at: new Date("2026-08-01T00:00:00Z"),
        },
      ],
    });
    const attempt = addCandidate(hr, { roleId: ROLE, fullName: "Sana Q", phone: "098110-00003" });
    await expect(attempt).rejects.toBeInstanceOf(DuplicateCandidateError);
    await expect(
      addCandidate(hr, { roleId: ROLE, fullName: "Sana Q", phone: "098110-00003" }),
    ).rejects.toThrow(/has applied before — for "Junior Draughtsman", rejected at HR conversation \("No site exposure at all"\)/);
    expect(callsMatching(/INSERT INTO hr\.candidates/)).toHaveLength(0);
    // matched on the last ten digits, however the number was typed
    expect(callsMatching(/right\(regexp_replace/)[0][1]).toEqual([null, "9811000003", null]);
  });

  it("adds them again when told to, with the earlier application on the trail", async () => {
    routes(
      seat(),
      {
        match: /right\(regexp_replace/,
        rows: [{ id: "old", full_name: "Sana", role_title: "Junior Draughtsman", status: "rejected", stage_label: "HR conversation", outcome_note: null, created_at: new Date() }],
      },
      { match: /INSERT INTO hr\.candidates/, rows: [{ id: CANDIDATE }] },
    );
    const added = await addCandidate(hr, { roleId: ROLE, fullName: "Sana", phone: "9811000003", confirmDuplicate: true });
    expect(added.previous).toHaveLength(1);
    const [, trail] = callsMatching(/INSERT INTO hr\.candidate_activity/)[0];
    expect(trail).toEqual([CANDIDATE, hr.id, "added the candidate again", 'applied before for "Junior Draughtsman" — rejected']);
  });
});

/* ── moving on ─────────────────────────────────────────────────────────── */

describe("moving somebody on", () => {
  it("refuses while an interviewer owes a write-up, and names them", async () => {
    routes(STAGES, movingCandidate(), seat(), owedBy("Dev Drafting HOD", "Dev COO", "Dev Founder"));
    await expect(moveCandidate(hr, CANDIDATE, "department")).rejects.toThrow(
      /3 interviewers have not written up a round that has already happened \(Dev Drafting HOD, Dev COO, Dev Founder\)/,
    );
  });

  it("counts an interview whose time has passed even if nobody marked it held", async () => {
    routes(STAGES, movingCandidate(), seat(), owedBy("Dev Drafting HOD"));
    await expect(moveCandidate(hr, CANDIDATE, "department")).rejects.toThrow(/1 interviewer has not written up/);
    const [sql] = callsMatching(/SELECT u\.full_name\s+FROM hr\.interviews i/)[0];
    expect(String(sql)).toMatch(/i\.status = 'scheduled'\s+AND i\.scheduled_at \+ i\.duration_mins \* INTERVAL '1 minute' <= NOW\(\)/);
  });

  it("moves when every interview that happened has been written up", async () => {
    routes(STAGES, movingCandidate(), seat(), owedBy());
    await moveCandidate(hr, CANDIDATE, "department");
    expect(callsMatching(/UPDATE hr\.candidates\s+SET stage/)[0][1]).toEqual([CANDIDATE, "department", "active"]);
  });

  it("moving to the final stage makes the offer — the status says so, not just the stage", async () => {
    routes(STAGES, movingCandidate({ stage: "department" }), seat(), owedBy());
    await moveCandidate(hr, CANDIDATE, "offer");
    expect(callsMatching(/UPDATE hr\.candidates\s+SET stage/)[0][1]).toEqual([CANDIDATE, "offer", "offered"]);
    expect(callsMatching(/INSERT INTO hr\.candidate_activity/)[0][1]).toEqual([CANDIDATE, hr.id, "made an offer (Offer)", null]);
    expect(auditMock).toHaveBeenCalledWith(expect.objectContaining({ newValues: expect.objectContaining({ status: "offered" }) }));
  });

  it("refuses a move on a closed seat", async () => {
    routes(STAGES, movingCandidate(), seat({ status: "closed" }), owedBy());
    await expect(moveCandidate(hr, CANDIDATE, "department")).rejects.toThrow(/is closed\. Reopen the seat before moving anybody on/);
  });

  it("refuses to move somebody who has stopped, or to where they already are", async () => {
    routes(STAGES, movingCandidate({ status: "rejected" }), seat(), owedBy());
    await expect(moveCandidate(hr, CANDIDATE, "department")).rejects.toThrow(/is rejected and is not moving/);
    routes(STAGES, movingCandidate({ stage: "department" }), seat(), owedBy());
    await expect(moveCandidate(hr, CANDIDATE, "department")).rejects.toThrow(/already at Department round/);
  });

  it("refuses a stage that is not in the pipeline, and says where stages live", async () => {
    routes(STAGES);
    await expect(moveCandidate(hr, CANDIDATE, "vibes_check")).rejects.toThrow(/hr\.interview_stages/);
  });
});

/* ── deciding ──────────────────────────────────────────────────────────── */

describe("deciding", () => {
  it("refuses a rejection with no reason", async () => {
    routes(STAGES, decidingCandidate(), seat());
    await expect(decideCandidate(hr, CANDIDATE, "rejected", "   ")).rejects.toThrow(/Say why in a sentence/);
  });

  it("does not flip a rejected candidate to hired", async () => {
    routes(STAGES, decidingCandidate({ status: "rejected" }), seat());
    await expect(decideCandidate(hr, CANDIDATE, "hired")).rejects.toThrow(/is rejected and is not moving.*Reopen them first/);
    expect(callsMatching(/UPDATE hr\.candidates/)).toHaveLength(0);
  });

  it("refuses a hire past the seat's headcount", async () => {
    routes(STAGES, decidingCandidate(), seat({ headcount: 1, hired: "1" }), owedBy());
    await expect(decideCandidate(hr, CANDIDATE, "hired")).rejects.toThrow(/is for 1 person and 1 is already hired/);
  });

  it("refuses a hire while a write-up is owed", async () => {
    routes(STAGES, decidingCandidate(), seat(), owedBy("Dev Drafting HOD"));
    await expect(decideCandidate(hr, CANDIDATE, "hired")).rejects.toThrow(/Hiring Aarti Sethi now decides without them/);
  });

  it("the hire that takes the last place marks the seat filled", async () => {
    routes(STAGES, decidingCandidate({ status: "offered", stage: "offer" }), seat({ headcount: 2, hired: "1" }), owedBy());
    await decideCandidate(hr, CANDIDATE, "hired");
    expect(callsMatching(/UPDATE hr\.open_roles SET status = 'filled'/)[0][1]).toEqual([ROLE]);
    expect(callsMatching(/INSERT INTO hr\.candidate_activity/).map(([, p]) => (p as unknown[])[2])).toEqual([
      "marked hired",
      "filled the seat",
    ]);
  });

  it("reopens somebody who stopped, with a reason, and clears the old outcome", async () => {
    routes(STAGES, decidingCandidate({ status: "rejected", stage: "hr_screen" }), seat());
    await expect(decideCandidate(hr, CANDIDATE, "active")).rejects.toThrow(/Say why they are being reopened/);
    await decideCandidate(hr, CANDIDATE, "active", "Came back with site experience");
    expect(callsMatching(/UPDATE hr\.candidates\s+SET status/)[0][1]).toEqual([CANDIDATE, "active", null]);
  });

  it("calls off the interviews still ahead of somebody who withdrew, and tells their panel — not the person deciding", async () => {
    routes(
      STAGES,
      decidingCandidate(),
      seat(),
      {
        match: /UPDATE hr\.interviews i SET status = 'cancelled'/,
        rows: [
          {
            id: INTERVIEW,
            scheduled_at: FUTURE,
            mode: "in_person",
            location: "NH8 — meeting room 2",
            stage_label: "Department round",
            candidate_name: "Aarti Sethi",
            role_title: "Junior Draughtsman",
          },
        ],
      },
      { match: /SELECT interview_id, user_id FROM hr\.interview_panel/, rows: [{ interview_id: INTERVIEW, user_id: HOD }, { interview_id: INTERVIEW, user_id: hr.id }] },
    );
    await decideCandidate(hr, CANDIDATE, "withdrawn", "Took another offer");
    expect(publishMock).toHaveBeenCalledTimes(1);
    const event = publishMock.mock.calls[0][0];
    expect(event.type).toBe("hiring.round_changed");
    expect(event.payload.recipientIds).toEqual([HOD]);
    expect(event.payload.change).toBe("called off — the candidate was withdrawn.");
    expect(callsMatching(/INSERT INTO hr\.candidate_activity/).map(([, p]) => (p as unknown[])[2])).toContain("called off Department round");
  });

  it("records the decision in the audit trail, with what it was before", async () => {
    routes(STAGES, decidingCandidate({ stage: "hr_screen" }), seat());
    await decideCandidate(hr, CANDIDATE, "rejected", "No site exposure at all.");
    expect(auditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "HIRING_DECISION",
        resourceId: CANDIDATE,
        oldValues: { status: "active", stage: "hr_screen" },
        newValues: { status: "rejected", stage: "hr_screen", note: "No site exposure at all." },
      }),
    );
  });
});

/* ── scheduling ────────────────────────────────────────────────────────── */

const SCHEDULABLE: Handler = {
  match: /SELECT status, full_name, role_id FROM hr\.candidates/,
  rows: [{ status: "active", full_name: "Aarti Sethi", role_id: ROLE }],
};

describe("scheduling an interview", () => {
  const base = { candidateId: CANDIDATE, stageCode: "department", scheduledAt: FUTURE.toISOString() };

  it("refuses an interview with nobody sitting in it, and says how to add them", async () => {
    routes(STAGES);
    await expect(scheduleInterview(hr, { ...base, panel: [] })).rejects.toThrow(/click a name in the list/);
  });

  it("refuses a time that is not a time", async () => {
    routes(STAGES);
    await expect(scheduleInterview(hr, { ...base, scheduledAt: "next tuesday-ish", panel: [hr.id] })).rejects.toThrow(
      /Pick a date and time/,
    );
  });

  it("refuses the final stage — an offer is not an interview", async () => {
    routes(STAGES);
    await expect(scheduleInterview(hr, { ...base, stageCode: "offer", panel: [hr.id] })).rejects.toThrow(/is not a round/);
  });

  it("refuses to schedule anything for somebody who has stopped moving", async () => {
    routes(STAGES, { match: /SELECT status, full_name, role_id FROM hr\.candidates/, rows: [{ status: "withdrawn", full_name: "Rohit Menon", role_id: ROLE }] });
    await expect(scheduleInterview(hr, { ...base, panel: [hr.id] })).rejects.toThrow(/is withdrawn\. Nothing is scheduled/);
  });

  it("refuses a question set written for another seat", async () => {
    routes(
      STAGES,
      SCHEDULABLE,
      seat(),
      { match: /SELECT u\.id, u\.full_name\s+FROM public\.users u/, rows: [{ id: hr.id, full_name: hr.name }] },
      {
        match: /FROM hr\.question_sets WHERE is_active/,
        rows: [{ id: SET, name: "Site engineer — HOD", role_id: "00000000-0000-4000-8000-00000000c002", stage_code: "department", is_active: true, created_at: new Date() }],
      },
    );
    await expect(scheduleInterview(hr, { ...base, panel: [hr.id], questionSetId: SET })).rejects.toThrow(
      /"Site engineer — HOD" was written for a different seat or stage/,
    );
  });

  it("chooses the stage's own questions over a seat-wide set", async () => {
    routes(
      STAGES,
      SCHEDULABLE,
      seat(),
      { match: /SELECT u\.id, u\.full_name\s+FROM public\.users u/, rows: [{ id: hr.id, full_name: hr.name }] },
      {
        match: /FROM hr\.question_sets WHERE is_active/,
        rows: [
          { id: "seat-wide", name: "Draughtsman — any", role_id: ROLE, stage_code: null, is_active: true, created_at: new Date("2026-09-10") },
          { id: "stage-own", name: "Department — craft", role_id: null, stage_code: "department", is_active: true, created_at: new Date("2026-09-01") },
        ],
      },
      { match: /INSERT INTO hr\.interviews/, rows: [{ id: INTERVIEW }] },
    );
    await scheduleInterview(hr, { ...base, panel: [hr.id] });
    expect((callsMatching(/INSERT INTO hr\.interviews/)[0][1] as unknown[])[2]).toBe("stage-own");
  });

  it("lets HR sit in, tells everybody else on the panel, and writes the time in IST", async () => {
    routes(
      STAGES,
      SCHEDULABLE,
      seat(),
      { match: /SELECT u\.id, u\.full_name\s+FROM public\.users u/, rows: [{ id: hr.id, full_name: "Dev HR Lead" }, { id: HOD, full_name: "Dev Drafting HOD" }] },
      { match: /INSERT INTO hr\.interviews/, rows: [{ id: INTERVIEW }] },
    );
    await scheduleInterview(hr, { ...base, scheduledAt: "2026-09-18T06:00:00.000Z", panel: [hr.id, HOD] });

    expect(callsMatching(/INSERT INTO hr\.interview_panel/).map(([, p]) => (p as unknown[])[1])).toEqual([hr.id, HOD]);
    const [, trail] = callsMatching(/INSERT INTO hr\.candidate_activity/)[0];
    expect((trail as unknown[])[3]).toBe("18 Sept 11:30 IST · Dev HR Lead, Dev Drafting HOD");

    expect(publishMock).toHaveBeenCalledTimes(1);
    const event = publishMock.mock.calls[0][0];
    expect(event.type).toBe("hiring.panel_added");
    expect(event.payload.recipientIds).toEqual([HOD]);
    expect(event.payload.interviewId).toBe(INTERVIEW);
  });

  it("a notification failure never fails the scheduling", async () => {
    publishMock.mockRejectedValue(new Error("events table unavailable"));
    routes(
      STAGES,
      SCHEDULABLE,
      seat(),
      { match: /SELECT u\.id, u\.full_name\s+FROM public\.users u/, rows: [{ id: HOD, full_name: "Dev Drafting HOD" }] },
      { match: /INSERT INTO hr\.interviews/, rows: [{ id: INTERVIEW }] },
    );
    await expect(scheduleInterview(hr, { ...base, panel: [HOD] })).resolves.toEqual({ id: INTERVIEW });
  });
});

/* ── an interview's status and details ─────────────────────────────────── */

function statusRound(over: Row = {}): Handler {
  return {
    match: /AS submitted\s+FROM hr\.interviews i/,
    rows: [
      {
        id: INTERVIEW,
        status: "scheduled",
        scheduled_at: PAST,
        mode: "in_person",
        location: null,
        candidate_id: CANDIDATE,
        stage_label: "Department round",
        candidate_name: "Aarti Sethi",
        candidate_status: "active",
        role_title: "Junior Draughtsman",
        submitted: "0",
        ...over,
      },
    ],
  };
}

describe("marking an interview held, called off or no-show", () => {
  it("cannot mark held an interview that has not started", async () => {
    routes(statusRound({ scheduled_at: FUTURE }));
    await expect(setInterviewStatus(hr, INTERVIEW, "done")).rejects.toThrow(/has not started yet/);
  });

  it("cannot call off an interview somebody already wrote up", async () => {
    routes(statusRound({ submitted: "1" }));
    await expect(setInterviewStatus(hr, INTERVIEW, "cancelled")).rejects.toThrow(/1 write-up is already in/);
  });

  it("calls an upcoming interview off and tells the panel", async () => {
    routes(statusRound({ scheduled_at: FUTURE }), {
      match: /SELECT interview_id, user_id FROM hr\.interview_panel/,
      rows: [{ interview_id: INTERVIEW, user_id: HOD }],
    });
    await setInterviewStatus(hr, INTERVIEW, "cancelled");
    expect(callsMatching(/UPDATE hr\.interviews SET status/)[0][1]).toEqual([INTERVIEW, "cancelled"]);
    expect(publishMock.mock.calls[0][0].payload).toMatchObject({ recipientIds: [HOD], change: "called off." });
  });
});

describe("changing an interview", () => {
  const editable: Handler = {
    match: /i\.question_set_id, i\.candidate_id, c\.status AS candidate_status/,
    rows: [
      {
        status: "scheduled",
        scheduled_at: FUTURE,
        duration_mins: 45,
        mode: "in_person",
        location: null,
        question_set_id: null,
        candidate_id: CANDIDATE,
        candidate_status: "active",
        role_id: ROLE,
        stage_code: "department",
        stage_label: "Department round",
        candidate_name: "Aarti Sethi",
        role_title: "Junior Draughtsman",
      },
    ],
  };

  it("will not take somebody off the panel once they have started writing it up", async () => {
    routes(
      editable,
      { match: /SELECT sc\.user_id, u\.full_name FROM hr\.scorecards/, rows: [{ user_id: HOD, full_name: "Dev Drafting HOD" }] },
      { match: /SELECT user_id, is_lead FROM hr\.interview_panel/, rows: [{ user_id: HOD, is_lead: true }, { user_id: hr.id, is_lead: false }] },
      { match: /SELECT u\.id, u\.full_name\s+FROM public\.users u/, rows: [{ id: hr.id, full_name: hr.name }] },
    );
    await expect(updateInterview(hr, INTERVIEW, { panel: [hr.id] })).rejects.toThrow(
      /Dev Drafting HOD has already started writing this interview up.*Excuse them instead/,
    );
  });

  it("adds somebody to the panel and tells them", async () => {
    routes(
      editable,
      { match: /SELECT sc\.user_id, u\.full_name FROM hr\.scorecards/, rows: [] },
      { match: /SELECT user_id, is_lead FROM hr\.interview_panel/, rows: [{ user_id: hr.id, is_lead: true }] },
      { match: /SELECT u\.id, u\.full_name\s+FROM public\.users u/, rows: [{ id: hr.id, full_name: hr.name }, { id: HOD, full_name: "Dev Drafting HOD" }] },
    );
    await updateInterview(hr, INTERVIEW, { panel: [hr.id, HOD] });
    const added = publishMock.mock.calls.find(([e]) => e.type === "hiring.panel_added");
    expect(added?.[0].payload.recipientIds).toEqual([HOD]);
  });
});

/* ── the scorecard ─────────────────────────────────────────────────────── */

describe("the scorecard", () => {
  it("is refused to somebody who was not in the room", async () => {
    routes({ match: /SELECT 1 AS one FROM hr\.interview_panel/, rows: [] });
    await expect(saveScorecard(hr, INTERVIEW, { recommendation: "yes", submit: true })).rejects.toBeInstanceOf(PermissionError);
  });

  it("cannot be submitted without a yes or a no", async () => {
    routes(ON_THE_PANEL);
    await expect(saveScorecard(hr, INTERVIEW, { strengths: "Good on paper", submit: true })).rejects.toThrow(
      /Say yes or no before you submit/,
    );
  });

  it("refuses a rating off the scale", async () => {
    routes(ON_THE_PANEL);
    await expect(saveScorecard(hr, INTERVIEW, { answers: [{ questionId: QUESTION, rating: 5 }] })).rejects.toThrow(
      /rating runs from 1 to 4/,
    );
  });

  it("cannot be submitted before the interview has started — a draft can", async () => {
    routes(ON_THE_PANEL, scorecardRound({ scheduled_at: FUTURE }), { match: /SELECT id, submitted_at FROM hr\.scorecards/, rows: [] }, { match: /INSERT INTO hr\.scorecards/, rows: [{ id: "card" }] });
    await expect(saveScorecard(hr, INTERVIEW, { recommendation: "yes", submit: true })).rejects.toThrow(/has not started yet/);
    await expect(saveScorecard(hr, INTERVIEW, { strengths: "Preparing" })).resolves.toEqual({ submitted: false });
  });

  it("cannot be submitted for an interview that was called off", async () => {
    routes(ON_THE_PANEL, scorecardRound({ status: "cancelled" }));
    await expect(saveScorecard(hr, INTERVIEW, { recommendation: "no", submit: true })).rejects.toThrow(/called off/);
  });

  it("refuses answers to questions this interview does not ask", async () => {
    routes(ON_THE_PANEL, scorecardRound(), { match: /SELECT id FROM hr\.questions WHERE set_id/, rows: [] });
    await expect(
      saveScorecard(hr, INTERVIEW, { answers: [{ questionId: QUESTION, rating: 3 }] }),
    ).rejects.toThrow(/questions this round does not ask/);
  });

  it("is one way — a submitted one cannot be rewritten", async () => {
    routes(ON_THE_PANEL, scorecardRound(), {
      match: /SELECT id, submitted_at FROM hr\.scorecards/,
      rows: [{ id: "card", submitted_at: new Date("2026-09-09T10:00:00Z") }],
    });
    await expect(saveScorecard(hr, INTERVIEW, { recommendation: "no", submit: true })).rejects.toThrow(
      /before you heard what anybody else thought/,
    );
  });

  it("writes the scorecard, its answers and the trail line in ONE transaction", async () => {
    routes(
      ON_THE_PANEL,
      scorecardRound(),
      { match: /SELECT id FROM hr\.questions WHERE set_id/, rows: [{ id: QUESTION }] },
      { match: /SELECT id, submitted_at FROM hr\.scorecards/, rows: [] },
      { match: /INSERT INTO hr\.scorecards/, rows: [{ id: "card" }] },
    );
    await saveScorecard(hr, INTERVIEW, {
      recommendation: "yes",
      answers: [{ questionId: QUESTION, rating: 3 }],
      submit: true,
    });
    // One transaction: a panel member outside HR used to get an error from a
    // second one, after the first had already saved their scorecard.
    expect(contextMock).toHaveBeenCalledTimes(1);
    const order = queryMock.mock.calls.map(([sql]) => String(sql));
    const card = order.findIndex((s) => /INSERT INTO hr\.scorecards/.test(s));
    const answer = order.findIndex((s) => /INSERT INTO hr\.scorecard_answers/.test(s));
    const trail = order.findIndex((s) => /INSERT INTO hr\.candidate_activity/.test(s));
    expect(card).toBeGreaterThanOrEqual(0);
    expect(answer).toBeGreaterThan(card);
    expect(trail).toBeGreaterThan(answer);
    expect(queryMock.mock.calls[trail][1]).toEqual([CANDIDATE, hr.id, "wrote up Department round", "yes"]);
    // …and the trail insert asks for nothing back: a panel member may write it but not read it.
    expect(order[trail]).not.toMatch(/RETURNING/);
  });
});

/* ── the second round of findings ──────────────────────────────────────── */

describe("after the recheck", () => {
  it("keeps the tracker's shared view-only login out of the panel picker", async () => {
    colleaguesMock.mockResolvedValue([
      { id: hr.id, name: hr.name, email: "dev.hr@essentia.in", jobTitle: null },
      { id: "00000000-0000-4000-8000-0000000000f7", name: "essentia — view only", email: "wio.view@essentia.in", jobTitle: null },
    ]);
    routes({ match: /d\.code = ANY/, rows: [{ id: "00000000-0000-4000-8000-0000000000f7" }] });
    const found = await searchHiringColleagues(hr, "essentia");
    expect(found.map((u) => u.email)).toEqual(["dev.hr@essentia.in"]);
  });

  it("asks before the last hire fills a seat others are still moving on — and fills it once told yes", async () => {
    const others: Handler = {
      match: /SELECT full_name, status FROM hr\.candidates\s+WHERE role_id = \$1 AND id <> \$2/,
      rows: [{ full_name: "Rohit Menon", status: "offered" }],
    };
    routes(STAGES, decidingCandidate(), seat({ headcount: 1, hired: "0" }), owedBy(), others);
    await expect(decideCandidate(hr, CANDIDATE, "hired")).rejects.toBeInstanceOf(NeedsConfirmationError);
    await expect(decideCandidate(hr, CANDIDATE, "hired")).rejects.toThrow(
      /takes the last place on "Junior Draughtsman".*Rohit Menon \(offered\) is still moving/,
    );
    expect(callsMatching(/UPDATE hr\.candidates/)).toHaveLength(0);

    await decideCandidate(hr, CANDIDATE, "hired", null, { confirm: true });
    expect(callsMatching(/UPDATE hr\.open_roles SET status = 'filled'/)).toHaveLength(1);
  });

  it("reopening the hire who filled a seat opens the seat again", async () => {
    routes(STAGES, decidingCandidate({ status: "hired", stage: "offer" }), seat({ status: "filled", headcount: 1, hired: "1" }));
    await decideCandidate(hr, CANDIDATE, "active", "Did not join");
    expect(callsMatching(/UPDATE hr\.open_roles SET status = 'open'/)[0][1]).toEqual([ROLE]);
  });

  it("calling off a stopped candidate's interviews leaves any that somebody already wrote up", async () => {
    routes(STAGES, decidingCandidate(), seat());
    await decideCandidate(hr, CANDIDATE, "withdrawn", "Took another offer");
    const [sql] = callsMatching(/UPDATE hr\.interviews i SET status = 'cancelled'/)[0];
    expect(String(sql)).toMatch(/NOT EXISTS \(SELECT 1 FROM hr\.scorecards sc\s+WHERE sc\.interview_id = i\.id AND sc\.submitted_at IS NOT NULL\)/);
  });

  it("a seat marked filled by hand stays filled when a typo is corrected", async () => {
    routes(seat({ status: "filled", headcount: 3, hired: "1" }));
    await updateRole(hr, ROLE, { title: "Junior Draughtsman", headcount: 3, notes: "fixed a typo" });
    expect(callsMatching(/UPDATE hr\.open_roles SET status = 'open'/)).toHaveLength(0);
    // …and reopens when the headcount is actually raised
    routes(seat({ status: "filled", headcount: 3, hired: "3" }));
    await updateRole(hr, ROLE, { title: "Junior Draughtsman", headcount: 4 });
    expect(callsMatching(/UPDATE hr\.open_roles SET status = 'open'/)).toHaveLength(1);
  });

  it("does not count an excused interviewer as owing a write-up", async () => {
    routes(STAGES, movingCandidate(), seat(), owedBy());
    await moveCandidate(hr, CANDIDATE, "department");
    const [sql] = callsMatching(/SELECT u\.full_name\s+FROM hr\.interviews i/)[0];
    expect(String(sql)).toMatch(/p\.excused_at IS NULL/);
  });

  it("excuses somebody only with a reason, only after the interview, and never somebody who wrote it up", async () => {
    const member = (over: Row = {}): Handler => ({
      match: /AS excused,\s+EXISTS/,
      rows: [{ full_name: "Dev Drafting HOD", excused: false, submitted: false, status: "scheduled", scheduled_at: PAST, duration_mins: 45, candidate_id: CANDIDATE, stage_label: "Department round", ...over }],
    });
    routes(member());
    await expect(excusePanelist(hr, INTERVIEW, HOD, "  ")).rejects.toThrow(/Say why they are excused/);
    routes(member({ submitted: true }));
    await expect(excusePanelist(hr, INTERVIEW, HOD, "On leave")).rejects.toThrow(/has already written this interview up/);
    routes(member({ scheduled_at: FUTURE }));
    await expect(excusePanelist(hr, INTERVIEW, HOD, "On leave")).rejects.toThrow(/has not happened yet/);

    routes(member());
    await excusePanelist(hr, INTERVIEW, HOD, "On leave until October");
    expect(callsMatching(/SET excused_at = NOW\(\), excused_by = \$3, excused_reason = \$4/)[0][1]).toEqual([INTERVIEW, HOD, hr.id, "On leave until October"]);
    expect(callsMatching(/INSERT INTO hr\.candidate_activity/)[0][1]).toEqual([
      CANDIDATE, hr.id, "excused Dev Drafting HOD from the Department round write-up", "On leave until October",
    ]);
  });

  it("the owed-write-up refusal only suggests ways out that work", async () => {
    routes(STAGES, movingCandidate(), seat(), owedBy("Dev Drafting HOD"));
    await expect(moveCandidate(hr, CANDIDATE, "department")).rejects.toThrow(/or excuse somebody who cannot write it up/);
  });

  describe("an interview that has started", () => {
    const started: Handler = {
      match: /i\.question_set_id, i\.candidate_id, c\.status AS candidate_status/,
      rows: [{
        status: "scheduled", scheduled_at: PAST, duration_mins: 45, mode: "in_person", location: null,
        question_set_id: null, candidate_id: CANDIDATE, candidate_status: "active", role_id: ROLE,
        stage_code: "department", stage_label: "Department round", candidate_name: "Aarti Sethi", role_title: "Junior Draughtsman",
      }],
    };
    const panelNow: Handler = { match: /SELECT user_id, is_lead FROM hr\.interview_panel/, rows: [{ user_id: HOD, is_lead: true }] };

    it("cannot be moved — that would erase the write-ups it is owed", async () => {
      routes(started, panelNow);
      await expect(updateInterview(hr, INTERVIEW, { scheduledAt: FUTURE.toISOString() })).rejects.toThrow(
        /has already started, so its time, questions and panel are fixed/,
      );
      await expect(updateInterview(hr, INTERVIEW, { durationMins: 600 })).rejects.toThrow(/already started/);
    });

    it("can still have somebody who sat in added to it", async () => {
      routes(started, panelNow, { match: /SELECT sc\.user_id, u\.full_name FROM hr\.scorecards/, rows: [] }, {
        match: /SELECT u\.id, u\.full_name\s+FROM public\.users u/, rows: [{ id: hr.id, full_name: hr.name }],
      });
      await updateInterview(hr, INTERVIEW, { panel: [HOD, hr.id] });
      expect(callsMatching(/INSERT INTO hr\.interview_panel/)[0][1]).toEqual([INTERVIEW, hr.id]);
      expect(callsMatching(/UPDATE hr\.interviews\s+SET scheduled_at/)).toHaveLength(0);
    });

    it("an edit that does not touch the panel does not re-check people who have since left", async () => {
      routes({ ...started, rows: [{ ...(started.rows as Row[])[0], scheduled_at: FUTURE }] }, panelNow, {
        match: /SELECT sc\.user_id, u\.full_name FROM hr\.scorecards/, rows: [],
      });
      await updateInterview(hr, INTERVIEW, { location: "NH8 — meeting room 3" });
      expect(callsMatching(/SELECT u\.id, u\.full_name\s+FROM public\.users u/)).toHaveLength(0);
    });
  });

  it("never loses a panel notice to a long candidate name", async () => {
    const long = "A".repeat(90);
    routes(
      STAGES,
      { match: /SELECT status, full_name, role_id FROM hr\.candidates/, rows: [{ status: "active", full_name: long, role_id: ROLE }] },
      seat(),
      { match: /SELECT u\.id, u\.full_name\s+FROM public\.users u/, rows: [{ id: HOD, full_name: "Dev Drafting HOD" }] },
      { match: /INSERT INTO hr\.interviews/, rows: [{ id: INTERVIEW }] },
    );
    await scheduleInterview(hr, { candidateId: CANDIDATE, stageCode: "department", scheduledAt: FUTURE.toISOString(), panel: [HOD] });
    const event = publishMock.mock.calls[0][0];
    expect(event.entityRef).toHaveLength(60);
    expect(event.payload.candidateName).toBe(long);
  });
});

/* ── the notifications' words ──────────────────────────────────────────── */

describe("panel notifications", () => {
  it("supply every {{variable}} their templates in db/049 use", () => {
    const sql = readFileSync(join(__dirname, "../../../db/049_hr_interviews.sql"), "utf8");
    const block = sql.slice(sql.indexOf("('hiring_panel_added'"), sql.indexOf("ON CONFLICT (code) DO NOTHING;", sql.indexOf("('hiring_panel_added'")));
    const used = new Set(Array.from(block.matchAll(/\{\{(\w+)\}\}/g), (m) => m[1]));
    expect(used.size).toBeGreaterThan(5);

    const payload = hiringNoticePayload(
      {
        id: INTERVIEW,
        scheduled_at: new Date("2026-09-18T06:00:00Z"),
        mode: "video",
        location: null,
        stage_label: "HR conversation",
        candidate_name: "Rohit Menon",
        role_title: "Junior Draughtsman",
      },
      [HOD],
      "",
    );
    for (const name of used) expect(payload, name).toHaveProperty(name);
    expect(payload).toMatchObject({ when: "18 Sept 11:30", mode: "video", whereLine: "" });
  });
});

it("BlockingRuleError is what every refusal above is", () => {
  expect(new BlockingRuleError("x").status).toBe(422);
});
