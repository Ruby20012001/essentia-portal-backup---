import { withUserContext } from "@/lib/db";
import type { SessionUser } from "@/lib/auth/session";
import { writeAudit } from "@/lib/services/audit";
import { requirePermission } from "@/lib/services/permissions";
import { BlockingRuleError } from "@/lib/services/blocking";
import { visibleTracks, type ContentType, type TrackName } from "@/lib/services/knowledge-logic";

/**
 * S16 · Knowledge Library (Brief §32) — the Wednesday Year sessions in
 * portal.knowledge_library. Browse by track, search by words, add a session.
 *
 * Search is Postgres full-text over title, content and tags. It matches
 * words, not meaning: the brief's semantic search needs the embedding
 * column filled, and no embedding provider has been chosen. When one is,
 * this is the function that changes; the page does not.
 *
 * Every query is limited to the tracks the viewer may read
 * (knowledge-logic visibleTracks), so a Strategic Leadership session is
 * never fetched for someone below L1.
 */

export type KnowledgeEntry = {
  id: string;
  title: string;
  content: string;
  contentType: string | null;
  track: string | null;
  roleTags: string[];
  topicTags: string[];
  projectTypeTags: string[];
  year: number | null;
  lead: string | null;
  sessionDate: string | null;
};

export type TrackCount = { track: string; sessions: number; leads: string[] };

export type KnowledgeSearch = { q?: string; track?: string; year?: number };

const SELECT = `
  SELECT k.id, k.title, k.content, k.content_type AS "contentType", k.track,
         COALESCE(k.role_tags, '[]'::jsonb) AS "roleTags",
         COALESCE(k.topic_tags, '[]'::jsonb) AS "topicTags",
         COALESCE(k.project_type_tags, '[]'::jsonb) AS "projectTypeTags",
         k.year_tag AS year, u.full_name AS lead, k.session_date::text AS "sessionDate"
    FROM portal.knowledge_library k
    LEFT JOIN public.users u ON u.id = k.senior_lead_id`;

/** Title, content and every tag, as one document for full-text search. */
const DOC = `to_tsvector('english',
  k.title || ' ' || k.content || ' ' ||
  COALESCE(k.role_tags::text, '') || ' ' || COALESCE(k.topic_tags::text, '') || ' ' ||
  COALESCE(k.project_type_tags::text, ''))`;

export async function searchKnowledge(
  user: SessionUser,
  s: KnowledgeSearch,
): Promise<{ entries: KnowledgeEntry[]; tracks: TrackCount[]; years: number[] }> {
  await requirePermission(user, "read", "knowledge_library");
  const allowed = visibleTracks(user.accessLevel);

  return withUserContext(user, async (q) => {
    const params: unknown[] = [allowed];
    const where = [`k.track = ANY($1::text[])`];
    let order = `k.session_date DESC NULLS LAST, k.created_at DESC`;

    if (s.track && allowed.includes(s.track as TrackName)) {
      params.push(s.track);
      where.push(`k.track = $${params.length}`);
    }
    if (s.year) {
      params.push(s.year);
      where.push(`k.year_tag = $${params.length}`);
    }
    const text = s.q?.trim().slice(0, 200);
    if (text) {
      params.push(text);
      where.push(`${DOC} @@ websearch_to_tsquery('english', $${params.length})`);
      order = `ts_rank(${DOC}, websearch_to_tsquery('english', $${params.length})) DESC, ${order}`;
    }

    const entries = await q<KnowledgeEntry>(
      `${SELECT} WHERE ${where.join(" AND ")} ORDER BY ${order} LIMIT 50`,
      params,
    );

    const tracks = await q<TrackCount>(
      `SELECT k.track, COUNT(*)::int AS sessions,
              COALESCE(ARRAY_AGG(DISTINCT u.full_name) FILTER (WHERE u.full_name IS NOT NULL), '{}') AS leads
         FROM portal.knowledge_library k
         LEFT JOIN public.users u ON u.id = k.senior_lead_id
        WHERE k.track = ANY($1::text[])
        GROUP BY k.track`,
      [allowed],
    );

    const years = await q<{ y: number }>(
      `SELECT DISTINCT year_tag AS y FROM portal.knowledge_library
        WHERE year_tag IS NOT NULL AND track = ANY($1::text[]) ORDER BY y DESC`,
      [allowed],
    );

    return { entries, tracks, years: years.map((r) => r.y) };
  });
}

export type NewKnowledge = {
  title: string;
  content: string;
  track: TrackName;
  contentType: ContentType;
  roleTags: string[];
  topicTags: string[];
  projectTypeTags: string[];
  year: number | null;
  sessionDate: string | null;
};

export async function addKnowledge(user: SessionUser, k: NewKnowledge): Promise<{ id: string }> {
  await requirePermission(user, "create", "knowledge_library");
  if (!visibleTracks(user.accessLevel).includes(k.track)) {
    // Writing into a track you cannot read would hide your own entry from you.
    throw new BlockingRuleError("Strategic Leadership sessions are added by leadership (L0–L1).");
  }
  const created = await withUserContext(user, async (q) => {
    const [row] = await q<{ id: string }>(
      `INSERT INTO portal.knowledge_library
         (title, content, content_type, track, role_tags, topic_tags, project_type_tags,
          year_tag, session_date, created_by)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8, $9, $10)
       RETURNING id`,
      [
        k.title,
        k.content,
        k.contentType,
        k.track,
        JSON.stringify(k.roleTags),
        JSON.stringify(k.topicTags),
        JSON.stringify(k.projectTypeTags),
        k.year,
        k.sessionDate,
        user.id,
      ],
    );
    return row!;
  });

  // After the transaction, as approveDiscount does: writeAudit takes its own
  // pool connection, and asking for it while withUserContext still holds one
  // deadlocks a single-connection pool and ties up two on any other.
  await writeAudit({
    userId: user.id,
    role: user.accessLevel,
    action: "KNOWLEDGE_ADDED",
    resourceType: "knowledge_library",
    resourceId: created.id,
    newValues: { title: k.title, track: k.track, contentType: k.contentType },
  });
  return created;
}
