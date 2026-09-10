import { query, withUserContext } from "@/lib/db";
import {
  BlockingRuleError,
  ConflictError,
  NotFoundError,
} from "@/lib/services/blocking";
import { PermissionError } from "@/lib/services/permissions";
import type { SessionUser } from "@/lib/auth/session";

/**
 * Concept decks — the design room's client-facing document (Brief §29).
 *
 * The deck tool has been one offline HTML file, which is right for a laptop
 * and wrong for five designers working the same deck. Here the deck lives in
 * the portal: the named design team reads and changes one, everybody else is
 * kept out, and the name against a change is the account that made it rather
 * than a name somebody typed into a box.
 *
 * Three rules this file exists to keep:
 *   · nothing deletes — a deck is archived, and the activity trail is
 *     append-only with no update path anywhere in the code;
 *   · a save carries the version it opened, so two people on one deck get a
 *     refusal instead of one of them losing an afternoon;
 *   · a deck is the client's plan and their money — the door is a named list,
 *     not "anybody who is signed in".
 */

export type DeckStage = "concept" | "execution";

export type DeckSummary = {
  id: string;
  name: string;
  projectCode: string | null;
  stage: DeckStage;
  version: number;
  spaces: number;
  updatedAt: string;
  updatedBy: string | null;
};

export type DeckActivityEntry = {
  at: string;
  by: string | null;
  what: string;
  did: string[];
};

export type DeckDetail = DeckSummary & {
  state: Record<string, unknown>;
  slots: string[];
  activity: DeckActivityEntry[];
  canEdit: boolean;
};

type DeckRow = {
  id: string;
  name: string;
  project_code: string | null;
  stage: DeckStage;
  version: number;
  state: Record<string, unknown>;
  updated_at: Date;
  updated_by_name: string | null;
};

/** The design team, by row, plus the levels that run the practice. */
export async function canEditDecks(user: SessionUser): Promise<boolean> {
  if (user.accessLevel === "L0" || user.accessLevel === "L1") return true;
  const rows = await query<{ one: number }>(
    "SELECT 1 AS one FROM ee.concept_deck_editors WHERE user_id = $1",
    [user.id],
  );
  return rows.length > 0;
}

/**
 * Reading is open to everybody signed in; changing is the named list.
 *
 * Monica asked for the tracker's shape — the whole company sees the work, the
 * people doing it are the only ones who can change it (10 Sep 2026). Signing
 * in is the door: a deck carries a client's plan, their renders and what the
 * work is costed at, so it is not put behind a link anybody could forward.
 *
 * Making it readable without signing in at all is a deliberate further step,
 * and would want its own route outside the portal shell, the way /board is.
 */
export async function canReadDecks(user: SessionUser): Promise<boolean> {
  return Boolean(user?.id);
}

async function requireReader(user: SessionUser): Promise<void> {
  if (!(await canReadDecks(user))) {
    throw new PermissionError(user, "read", "concept_deck");
  }
}

async function requireEditor(user: SessionUser): Promise<void> {
  if (!(await canEditDecks(user))) {
    throw new PermissionError(user, "edit", "concept_deck");
  }
}

function countSpaces(state: unknown): number {
  const spaces = (state as { spaces?: unknown[] } | null)?.spaces;
  return Array.isArray(spaces) ? spaces.length : 0;
}

function toSummary(row: DeckRow): DeckSummary {
  return {
    id: row.id,
    name: row.name,
    projectCode: row.project_code,
    stage: row.stage,
    version: row.version,
    spaces: countSpaces(row.state),
    updatedAt: row.updated_at.toISOString(),
    updatedBy: row.updated_by_name,
  };
}

/** Every deck the design team may read, newest work first. */
export async function listDecks(user: SessionUser): Promise<DeckSummary[]> {
  await requireReader(user);
  return withUserContext(user, async (q) => {
    const rows = await q<DeckRow>(
      `SELECT d.id, d.name, d.project_code, d.stage, d.version,
              jsonb_build_object('spaces', d.state->'spaces') AS state,
              d.updated_at, u.full_name AS updated_by_name
         FROM ee.concept_decks d
         LEFT JOIN public.users u ON u.id = d.updated_by
        WHERE d.is_archived = FALSE
        ORDER BY d.updated_at DESC`,
    );
    return rows.map(toSummary);
  });
}

export async function getDeck(
  user: SessionUser,
  id: string,
): Promise<DeckDetail> {
  await requireReader(user);
  const [row] = await withUserContext(user, (q) =>
    q<DeckRow>(
      `SELECT d.id, d.name, d.project_code, d.stage, d.version, d.state,
              d.updated_at, u.full_name AS updated_by_name
         FROM ee.concept_decks d
         LEFT JOIN public.users u ON u.id = d.updated_by
        WHERE d.id = $1 AND d.is_archived = FALSE`,
      [id],
    ),
  );
  if (!row) throw new NotFoundError(`No deck ${id}`);

  const [slots, activity, canEdit] = await Promise.all([
    query<{ slot: string }>(
      "SELECT slot FROM ee.concept_deck_images WHERE deck_id = $1 ORDER BY slot",
      [id],
    ),
    listDeckActivity(id),
    canEditDecks(user),
  ]);

  return {
    ...toSummary(row),
    state: row.state,
    slots: slots.map((s) => s.slot),
    activity,
    canEdit,
  };
}

/**
 * The same deck, read by somebody who is not signed in at all.
 *
 * Monica asked for the board's shape exactly (10 Sep 2026): open the link and
 * read it, download it, change nothing. So this takes no user and grants no
 * capability — canEdit is false because there is nobody to be an editor.
 *
 * It carries the activity trail too. Who worked on a deck is not a secret from
 * the people the deck is being shown to; it is the answer to "who do I ask".
 */
export async function getPublicDeck(id: string): Promise<DeckDetail> {
  const [row] = await query<DeckRow>(
    `SELECT d.id, d.name, d.project_code, d.stage, d.version, d.state,
            d.updated_at, u.full_name AS updated_by_name
       FROM ee.concept_decks d
       LEFT JOIN public.users u ON u.id = d.updated_by
      WHERE d.id = $1 AND d.is_archived = FALSE`,
    [id],
  );
  if (!row) throw new NotFoundError(`No deck ${id}`);
  const activity = await listDeckActivity(id);
  return { ...toSummary(row), state: row.state, slots: [], activity, canEdit: false };
}

/** Every deck, for the open list. Names and dates; no state, no pictures. */
export async function listPublicDecks(): Promise<DeckSummary[]> {
  const rows = await query<DeckRow>(
    `SELECT d.id, d.name, d.project_code, d.stage, d.version,
            jsonb_build_object('spaces', d.state->'spaces') AS state,
            d.updated_at, u.full_name AS updated_by_name
       FROM ee.concept_decks d
       LEFT JOIN public.users u ON u.id = d.updated_by
      WHERE d.is_archived = FALSE
      ORDER BY d.updated_at DESC`,
  );
  return rows.map(toSummary);
}

/** Newest first. Append-only: there is no update or delete path for these. */
export async function listDeckActivity(
  deckId: string,
  limit = 60,
): Promise<DeckActivityEntry[]> {
  const rows = await query<{
    at: Date;
    by: string | null;
    what: string;
    did: string[];
  }>(
    `SELECT a.at, u.full_name AS by, a.what, a.did
       FROM ee.concept_deck_activity a
       LEFT JOIN public.users u ON u.id = a.user_id
      WHERE a.deck_id = $1
      ORDER BY a.at DESC
      LIMIT $2`,
    [deckId, limit],
  );
  return rows.map((r) => ({
    at: r.at.toISOString(),
    by: r.by,
    what: r.what,
    did: r.did ?? [],
  }));
}

export async function createDeck(
  user: SessionUser,
  input: { name: string; projectCode?: string | null; state: unknown },
): Promise<DeckSummary> {
  await requireEditor(user);
  const name = String(input.name || "").trim();
  if (!name) {
    throw new BlockingRuleError("A deck needs a name before it can be saved.");
  }
  const [row] = await withUserContext(user, (q) =>
    q<DeckRow>(
      `INSERT INTO ee.concept_decks (name, project_code, state, created_by, updated_by)
       VALUES ($1, $2, $3::jsonb, $4, $4)
       RETURNING id, name, project_code, stage, version, state, updated_at,
                 NULL::varchar AS updated_by_name`,
      [name, input.projectCode ?? null, JSON.stringify(input.state ?? {}), user.id],
    ),
  );
  await noteActivity(user, row.id, "created the deck", []);
  return toSummary({ ...row, updated_by_name: user.name });
}

/**
 * A save carries the version it opened. If somebody else saved in between, it
 * is refused — the editor then reloads and the work is merged by a person, who
 * can see what changed, rather than by whoever pressed the button last.
 */
export async function saveDeck(
  user: SessionUser,
  id: string,
  input: {
    state: unknown;
    version: number;
    name?: string;
    projectCode?: string | null;
    stage?: DeckStage;
    did?: string[];
    what?: string;
  },
): Promise<{ version: number; updatedAt: string }> {
  await requireEditor(user);

  const result = await withUserContext(user, async (q) => {
    const [current] = await q<{ version: number }>(
      "SELECT version FROM ee.concept_decks WHERE id = $1 AND is_archived = FALSE",
      [id],
    );
    if (!current) throw new NotFoundError(`No deck ${id}`);
    if (current.version !== input.version) {
      throw new ConflictError(
        `This deck was saved by somebody else while you were working on it ` +
          `(you opened version ${input.version}, it is now ${current.version}). ` +
          `Open it again to see their changes.`,
      );
    }
    const [row] = await q<{ version: number; updated_at: Date }>(
      `UPDATE ee.concept_decks
          SET state = $2::jsonb,
              name = COALESCE($3, name),
              project_code = COALESCE($4, project_code),
              stage = COALESCE($5, stage),
              version = version + 1,
              updated_by = $6,
              updated_at = NOW()
        WHERE id = $1
        RETURNING version, updated_at`,
      [
        id,
        JSON.stringify(input.state ?? {}),
        input.name ?? null,
        input.projectCode ?? null,
        input.stage ?? null,
        user.id,
      ],
    );
    return row;
  });

  await noteActivity(user, id, input.what ?? "saved", input.did ?? []);
  return { version: result.version, updatedAt: result.updated_at.toISOString() };
}

/** The only way a row reaches the activity table. */
export async function noteActivity(
  user: SessionUser,
  deckId: string,
  what: string,
  did: string[],
): Promise<void> {
  await query(
    `INSERT INTO ee.concept_deck_activity (deck_id, user_id, what, did)
     VALUES ($1, $2, $3, $4)`,
    [deckId, user.id, what.slice(0, 60), did.slice(0, 40)],
  );
}

/** Archived, never removed — the trail has to keep pointing at something. */
export async function archiveDeck(
  user: SessionUser,
  id: string,
): Promise<void> {
  await requireEditor(user);
  await withUserContext(user, (q) =>
    q(
      `UPDATE ee.concept_decks SET is_archived = TRUE, updated_by = $2, updated_at = NOW()
        WHERE id = $1`,
      [id, user.id],
    ),
  );
  await noteActivity(user, id, "archived the deck", []);
}

/* ── the pictures ──────────────────────────────────────────────────────── */

export async function putDeckImage(
  user: SessionUser,
  deckId: string,
  slot: string,
  image: { bytes: Buffer; mime: string; width?: number; height?: number },
): Promise<void> {
  await requireEditor(user);
  if (!slot || slot.length > 120) {
    throw new BlockingRuleError("A picture needs a slot to belong to.");
  }
  await query(
    `INSERT INTO ee.concept_deck_images (deck_id, slot, mime, bytes, width, height)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (deck_id, slot)
     DO UPDATE SET bytes = EXCLUDED.bytes, mime = EXCLUDED.mime,
                   width = EXCLUDED.width, height = EXCLUDED.height`,
    [deckId, slot, image.mime, image.bytes, image.width ?? null, image.height ?? null],
  );
}

export async function getDeckImage(
  deckId: string,
  slot: string,
): Promise<{ bytes: Buffer; mime: string } | null> {
  const [row] = await query<{ bytes: Buffer; mime: string }>(
    "SELECT bytes, mime FROM ee.concept_deck_images WHERE deck_id = $1 AND slot = $2",
    [deckId, slot],
  );
  return row ?? null;
}
