import { query } from "@/lib/db";
import { writeAudit } from "@/lib/services/audit";
import type { SessionUser } from "@/lib/auth/session";

/**
 * Succession pack (Brief §36 · Velocity Gate #7). "Succession pack auto-generates
 * when an exit date is confirmed in Keka. The successor does not wait for a
 * briefing." Generated same-day on confirmation — the 11:59pm removal protocol is
 * a separate concern (exit-protocol.ts).
 *
 * CONFIGURATION-DRIVEN: what a pack CONTAINS is data, not code. The sections, their
 * order, titles and wording live in portal.succession_pack_sections; HR changes the
 * pack with row edits and never a deploy. This module holds only RESOLVERS — one
 * small registry keyed by source_kind, the same pattern as the notification
 * recipient strategies. Adding a section HR can already express (a checklist, a
 * document list, a note) needs NO code at all; only a genuinely new *live* data
 * source needs a new registry entry.
 */

export type PackSection = {
  code: string;
  title: string;
  sourceKind: string;
  items: string[];
  note: string | null;
};

export type SuccessionPack = {
  userId: string;
  exitDate: string;
  generatedAt: string;
  sections: PackSection[];
};

type SectionTemplate = {
  code: string;
  title: string;
  source_kind: string;
  params: { items?: string[]; text?: string } | null;
  sort_order: number;
};

type PackContext = {
  id: string;
  name: string;
  jobTitle: string | null;
  exitDate: string;
};

/** {{name}} / {{jobTitle}} / {{exitDate}} — the vars HR may use in params. Pure. */
export function renderTemplate(text: string, ctx: PackContext): string {
  return text
    .replace(/\{\{name\}\}/g, ctx.name)
    .replace(/\{\{jobTitle\}\}/g, ctx.jobTitle ?? "—")
    .replace(/\{\{exitDate\}\}/g, ctx.exitDate);
}

type Resolver = (tpl: SectionTemplate, ctx: PackContext) => Promise<{ items: string[]; note: string | null }>;

/**
 * The resolver registry. `checklist` / `documents` / `static_note` are pure data —
 * HR composes them entirely through params. The rest read live portal state.
 * A source_kind with no resolver is reported, never silently dropped.
 */
const RESOLVERS: Record<string, Resolver> = {
  checklist: async (tpl, ctx) => ({
    items: (tpl.params?.items ?? []).map((i) => renderTemplate(i, ctx)),
    note: null,
  }),

  documents: async (tpl, ctx) => ({
    items: (tpl.params?.items ?? []).map((i) => renderTemplate(i, ctx)),
    note: null,
  }),

  static_note: async (tpl, ctx) => ({
    items: tpl.params?.text ? [renderTemplate(tpl.params.text, ctx)] : [],
    note: null,
  }),

  project_ownership: async (_tpl, ctx) => {
    const rows = await query<{ project_code: string; role: string }>(
      `SELECT p.project_code, r.role
       FROM ee.projects p
       CROSS JOIN LATERAL (VALUES
         ('CRM TL', p.crmtl_id), ('PMC', p.pmc_id), ('Designer', p.designer_id),
         ('Architect', p.architect_id), ('Visualiser', p.visualiser_id),
         ('Site supervisor', p.site_supervisor_id)
       ) AS r(role, user_id)
       WHERE p.is_active AND r.user_id = $1
       ORDER BY p.project_code, r.role`,
      [ctx.id],
    );
    return {
      items: rows.map((r) => `${r.project_code} — ${r.role}`),
      note: rows.length === 0 ? "No active project is owned by this person." : null,
    };
  },

  pending_approvals: async (_tpl, ctx) => {
    const rows = await query<{ workflow_name: string; group_name: string }>(
      `SELECT d.name AS workflow_name, g.name AS group_name
       FROM portal.workflow_tasks t
       JOIN portal.workflow_instances i ON i.id = t.instance_id AND i.status = 'pending'
       JOIN portal.workflow_definitions d ON d.code = i.workflow_code
       JOIN portal.workflow_groups g
         ON g.definition_code = i.workflow_code AND g.group_no = t.group_no
       WHERE t.status = 'pending' AND t.group_no = i.current_step
         AND COALESCE(t.delegated_to_user_id, t.assignee_user_id) = $1
       ORDER BY d.name`,
      [ctx.id],
    );
    return {
      items: rows.map((r) => `${r.workflow_name} — ${r.group_name}`),
      note: rows.length === 0 ? "Nothing is awaiting this person." : "These stall on exit — reassign or delegate.",
    };
  },
};

/** Build the pack for one person from the active template rows. */
async function buildPack(ctx: PackContext): Promise<PackSection[]> {
  const templates = await query<SectionTemplate>(
    `SELECT code, title, source_kind, params, sort_order
     FROM portal.succession_pack_sections
     WHERE is_active
     ORDER BY sort_order, code`,
  );

  const sections: PackSection[] = [];
  for (const tpl of templates) {
    const resolver = RESOLVERS[tpl.source_kind];
    if (!resolver) {
      // Config references a source this build does not know — say so loudly
      // rather than quietly omitting a section HR believes is in the pack.
      sections.push({
        code: tpl.code,
        title: tpl.title,
        sourceKind: tpl.source_kind,
        items: [],
        note: `No resolver registered for source_kind '${tpl.source_kind}' — this section could not be generated.`,
      });
      continue;
    }
    const { items, note } = await resolver(tpl, ctx);
    sections.push({ code: tpl.code, title: tpl.title, sourceKind: tpl.source_kind, items, note });
  }
  return sections;
}

/**
 * Generate packs for every confirmed exit that has none yet. Idempotent via
 * UNIQUE(user_id, exit_date). `regenerate` rebuilds an existing pack in place —
 * how HR picks up a template change for an exit already on the books.
 */
export async function generateSuccessionPacks(
  actor: SessionUser,
  opts: { regenerate?: boolean } = {},
): Promise<{ generated: number; names: string[] }> {
  const due = await query<{ id: string; full_name: string; job_title: string | null; exit_date: string }>(
    `SELECT u.id, u.full_name, u.job_title, u.exit_date::text AS exit_date
     FROM public.users u
     WHERE u.exit_date IS NOT NULL
       ${opts.regenerate ? "" : `AND NOT EXISTS (
         SELECT 1 FROM portal.succession_packs sp
         WHERE sp.user_id = u.id AND sp.exit_date = u.exit_date)`}
     ORDER BY u.exit_date, u.full_name`,
  );

  for (const u of due) {
    const ctx: PackContext = { id: u.id, name: u.full_name, jobTitle: u.job_title, exitDate: u.exit_date };
    const sections = await buildPack(ctx);
    await query(
      `INSERT INTO portal.succession_packs (user_id, exit_date, generated_by, sections)
       VALUES ($1, $2::date, $3, $4::jsonb)
       ON CONFLICT (user_id, exit_date) DO UPDATE
         SET sections = EXCLUDED.sections, generated_at = NOW(), generated_by = EXCLUDED.generated_by`,
      [u.id, u.exit_date, actor.id, JSON.stringify(sections)],
    );
    await writeAudit({
      userId: actor.id,
      role: actor.accessLevel,
      action: "SUCCESSION_PACK_GENERATED",
      resourceType: "users",
      resourceId: u.id,
      newValues: { exitDate: u.exit_date, sections: sections.length },
    });
  }
  return { generated: due.length, names: due.map((u) => u.full_name) };
}

/** Generated packs, keyed by user id — for the Exit Protocol board. */
export async function listSuccessionPacks(): Promise<Map<string, SuccessionPack>> {
  const rows = await query<{
    user_id: string;
    exit_date: string;
    generated_at: string;
    sections: PackSection[];
  }>(
    `SELECT user_id, exit_date::text AS exit_date, generated_at::text AS generated_at, sections
     FROM portal.succession_packs`,
  );
  return new Map(
    rows.map((r) => [
      r.user_id,
      { userId: r.user_id, exitDate: r.exit_date, generatedAt: r.generated_at, sections: r.sections ?? [] },
    ]),
  );
}
