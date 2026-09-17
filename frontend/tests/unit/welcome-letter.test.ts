import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Welcome Letter + the TL read gate (Brief §28 · Velocity Gate 8).
 *
 * SCOPE OF THIS FILE. The module is DB-backed, so these are unit tests of the
 * TypeScript contract. The one that matters most is the read gate: CLAUDE.md
 * makes it a permanent constraint, the UI disables the button, and these tests
 * prove the SERVER refuses independently — because a disabled button is a
 * courtesy, not an enforcement. The SLA arithmetic and the draft copy are
 * covered as pure functions. Row visibility lives in RLS.
 */

const { queryMock, auditMock, requirePermissionMock, getConfigMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  auditMock: vi.fn(),
  requirePermissionMock: vi.fn(),
  getConfigMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  query: queryMock,
  withUserContext: async (_user: unknown, fn: (q: unknown) => unknown) => fn(queryMock),
}));
vi.mock("@/lib/services/audit", () => ({ writeAudit: auditMock }));
vi.mock("@/lib/services/permissions", () => ({ requirePermission: requirePermissionMock }));
vi.mock("@/lib/services/config", () => ({ getConfig: getConfigMock }));

import {
  buildWelcomeLetterDraft,
  markLetterRead,
  sendWelcomeLetter,
  welcomeCounts,
  type WelcomeLetter,
} from "@/lib/services/welcome-letter";
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

const tl = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "Dev CRM Team Lead",
  accessLevel: "L2" as const,
  departmentId: null,
};

const LETTER_ID = "00000000-0000-4000-8000-00000000c001";

/** The full-row shape SELECT_LETTERS returns, used by the re-read after a write. */
function fullRow(over: Partial<Row> = {}): Row {
  return {
    id: LETTER_ID,
    project_id: "00000000-0000-4000-8000-00000000a001",
    project_code: "ED/26-27/901",
    project_name: "Mehra Residence",
    family_name: "Mehra Family",
    ai_draft: "Dear Mehra Family,…",
    final_content: null,
    channel: "whatsapp",
    scroll_complete: true,
    reviewed_by: "Dev CRM Team Lead",
    reviewed_at: "2026-07-30T10:00:00.000Z",
    sent_at: null,
    drafted_at: "2026-07-30T09:00:00.000Z",
    triggered_at: "2026-07-30T08:00:00.000Z",
    trigger_precise: true,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  requirePermissionMock.mockResolvedValue({ allowed: true, scope: "own_dept" });
  getConfigMock.mockResolvedValue(4);
});

describe("the read gate — the server refuses, not just the button", () => {
  it("refuses to send a letter the TL has not read to the end", async () => {
    routes({
      match: /SELECT id, scroll_complete/,
      rows: [{ id: LETTER_ID, scroll_complete: false, sent_at: null }],
    });

    await expect(sendWelcomeLetter(tl, LETTER_ID)).rejects.toBeInstanceOf(BlockingRuleError);
    await expect(sendWelcomeLetter(tl, LETTER_ID)).rejects.toThrow(
      "Read the letter to the end before sending it. The send button opens once you have scrolled to the bottom.",
    );
  });

  it("does not write anything when the gate refuses", async () => {
    routes({
      match: /SELECT id, scroll_complete/,
      rows: [{ id: LETTER_ID, scroll_complete: false, sent_at: null }],
    });

    await expect(sendWelcomeLetter(tl, LETTER_ID)).rejects.toThrow();

    const wrote = queryMock.mock.calls.some((c) => /UPDATE portal\.communication_spine/.test(String(c[0])));
    expect(wrote).toBe(false);
    expect(auditMock).not.toHaveBeenCalled();
  });

  it("guards the UPDATE itself on scroll_complete — the check cannot be raced past", async () => {
    routes(
      { match: /SELECT id, scroll_complete/, rows: [{ id: LETTER_ID, scroll_complete: true, sent_at: null }] },
      { match: /UPDATE portal\.communication_spine/, rows: [{ id: LETTER_ID }] },
      { match: /FROM portal\.communication_spine/, rows: [fullRow({ sent_at: "2026-07-30T11:00:00.000Z" })] },
    );

    await sendWelcomeLetter(tl, LETTER_ID);

    const update = queryMock.mock.calls.map((c) => String(c[0])).find((s) => /UPDATE portal\.communication_spine/.test(s))!;
    expect(update).toMatch(/scroll_complete/);
    expect(update).toMatch(/sent_at IS NULL/);
  });

  it("requires approve on communication_spine before touching a row", async () => {
    requirePermissionMock.mockRejectedValueOnce(new Error("denied"));
    await expect(sendWelcomeLetter(tl, LETTER_ID)).rejects.toThrow("denied");
    expect(requirePermissionMock).toHaveBeenCalledWith(tl, "approve", "communication_spine");
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("refuses a letter that was already sent", async () => {
    routes({
      match: /SELECT id, scroll_complete/,
      rows: [{ id: LETTER_ID, scroll_complete: true, sent_at: "2026-07-29T10:00:00.000Z" }],
    });
    await expect(sendWelcomeLetter(tl, LETTER_ID)).rejects.toThrow("That letter has already been sent.");
  });

  it("loses the race honestly when another tab sends first", async () => {
    routes(
      { match: /SELECT id, scroll_complete/, rows: [{ id: LETTER_ID, scroll_complete: true, sent_at: null }] },
      { match: /UPDATE portal\.communication_spine/, rows: [] },
    );
    await expect(sendWelcomeLetter(tl, LETTER_ID)).rejects.toThrow(
      "That letter was sent by someone else a moment ago.",
    );
    expect(auditMock).not.toHaveBeenCalled();
  });

  it("sends once the gate is satisfied, and audits it", async () => {
    routes(
      { match: /SELECT id, scroll_complete/, rows: [{ id: LETTER_ID, scroll_complete: true, sent_at: null }] },
      { match: /UPDATE portal\.communication_spine/, rows: [{ id: LETTER_ID }] },
      { match: /FROM portal\.communication_spine/, rows: [fullRow({ sent_at: "2026-07-30T11:00:00.000Z" })] },
    );

    const letter = await sendWelcomeLetter(tl, LETTER_ID);

    expect(letter.status).toBe("sent");
    expect(auditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: tl.id,
        action: "WELCOME_LETTER_SENT",
        resourceType: "communication_spine",
        resourceId: LETTER_ID,
      }),
    );
  });
});

describe("markLetterRead — who read it, and when", () => {
  it("stamps the reader from the session, never from the caller", async () => {
    routes(
      { match: /SELECT id, sent_at/, rows: [{ id: LETTER_ID, sent_at: null }] },
      { match: /FROM portal\.communication_spine/, rows: [fullRow()] },
    );

    await markLetterRead(tl, LETTER_ID);

    const update = queryMock.mock.calls.map((c) => String(c[0])).find((s) => /UPDATE portal\.communication_spine/.test(s))!;
    expect(update).toMatch(/scroll_complete = TRUE/);
    expect(update).toMatch(/current_setting\('app\.user_id'/);
    expect(auditMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "WELCOME_LETTER_READ", resourceId: LETTER_ID }),
    );
  });

  it("refuses on a letter that has already gone to the family", async () => {
    routes({ match: /SELECT id, sent_at/, rows: [{ id: LETTER_ID, sent_at: "2026-07-29T10:00:00.000Z" }] });
    await expect(markLetterRead(tl, LETTER_ID)).rejects.toThrow("That letter has already been sent.");
  });

  it("refuses a letter that is not visible, without leaking whether it exists", async () => {
    routes({ match: /SELECT id, sent_at/, rows: [] });
    await expect(markLetterRead(tl, LETTER_ID)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("the draft", () => {
  it("addresses the family and names the project, and carries no banned words", () => {
    const body = buildWelcomeLetterDraft({ familyName: "Mehra Family", projectCode: "ED/26-27/901" });
    expect(body).toContain("Dear Mehra Family");
    expect(body).toContain("ED/26-27/901");
    // CLAUDE.md vocabulary — these must never reach a family.
    for (const banned of ["luxury", "bespoke", "curated", "seamless", "holistic", "world-class"]) {
      expect(body.toLowerCase()).not.toContain(banned);
    }
    // essentia is always lowercase.
    expect(body).not.toMatch(/\bEssentia\b/);
  });
});

describe("welcomeCounts — the rollup is pure", () => {
  const mk = (over: Partial<WelcomeLetter>): WelcomeLetter =>
    ({
      id: "x",
      projectId: "p",
      projectCode: "ED/26-27/901",
      projectName: null,
      familyName: "F",
      status: "draft",
      body: "",
      channel: "whatsapp",
      triggeredAt: null,
      draftedAt: null,
      reviewedBy: null,
      reviewedAt: null,
      sentAt: null,
      hoursToDraft: null,
      slaBreached: false,
      slaImprecise: false,
      ...over,
    }) as WelcomeLetter;

  it("separates awaiting-read from awaiting-send from sent, and counts breaches", () => {
    const counts = welcomeCounts([
      mk({ status: "draft" }),
      mk({ status: "read" }),
      mk({ status: "sent" }),
      mk({ status: "sent", slaBreached: true }),
    ]);
    expect(counts).toEqual({ total: 4, awaitingRead: 1, awaitingSend: 1, sent: 2, breached: 1 });
  });

  it("a breach still counts once it has been sent — the delay stays on record", () => {
    const counts = welcomeCounts([mk({ status: "sent", slaBreached: true })]);
    expect(counts.sent).toBe(1);
    expect(counts.breached).toBe(1);
  });
});
