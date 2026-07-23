import { withUserContext } from "@/lib/db";
import type { SessionUser } from "@/lib/auth/session";

/**
 * Design Room (Brief §29) — the 14-stage Drawing Ladder for a project
 * (CP → SLD → FI → TP → GFC → AB). READ-ONLY: it surfaces ee.design_stages and
 * derives progress; it writes nothing. Row visibility is RLS-scoped through the
 * parent project (getDesignRoom loads the project under withUserContext first,
 * so a project outside the caller's fence reads as nonexistent).
 */

export type DesignStage = {
  stageNo: number;
  stageName: string;
  drawingLevel: string | null;
  status: string;
  plannedDate: string | null;
  actualDate: string | null;
  approvedBy: string | null;
};

export type DesignRoom = {
  project: { id: string; code: string; name: string | null; designer: string | null };
  stages: DesignStage[];
  metrics: {
    total: number;
    complete: number;
    percent: number;
    pendingApprovals: number;
    currentStageNo: number | null;
    currentStageName: string | null;
    currentLevel: string | null;
  };
};

export async function getDesignRoom(user: SessionUser, projectId: string): Promise<DesignRoom | null> {
  return withUserContext(user, async (q) => {
    const [proj] = await q<{
      id: string;
      project_code: string;
      project_name: string | null;
      designer: string | null;
    }>(
      `SELECT p.id, p.project_code, p.project_name, d.full_name AS designer
       FROM ee.projects p
       LEFT JOIN public.users d ON d.id = p.designer_id
       WHERE p.id = $1 AND p.is_active`,
      [projectId],
    );
    if (!proj) return null;

    const rows = await q<{
      stage_no: number;
      stage_name: string;
      drawing_level: string | null;
      status: string;
      planned_date: string | null;
      actual_date: string | null;
      approved_by: string | null;
    }>(
      `SELECT s.stage_no, s.stage_name, s.drawing_level, s.status,
              s.planned_date::text AS planned_date, s.actual_date::text AS actual_date,
              a.full_name AS approved_by
       FROM ee.design_stages s
       LEFT JOIN public.users a ON a.id = s.approved_by
       WHERE s.project_id = $1
       ORDER BY s.stage_no`,
      [projectId],
    );

    const stages: DesignStage[] = rows.map((r) => ({
      stageNo: r.stage_no,
      stageName: r.stage_name,
      drawingLevel: r.drawing_level,
      status: r.status,
      plannedDate: r.planned_date,
      actualDate: r.actual_date,
      approvedBy: r.approved_by,
    }));

    const total = stages.length;
    const complete = stages.filter((s) => s.status === "complete").length;
    const pendingApprovals = stages.filter((s) => s.status === "pending_approval").length;
    const percent = total ? Math.round((complete / total) * 100) : 0;
    // The current stage is the first that isn't complete (else the last stage).
    const current = stages.find((s) => s.status !== "complete") ?? stages[stages.length - 1] ?? null;

    return {
      project: { id: proj.id, code: proj.project_code, name: proj.project_name, designer: proj.designer },
      stages,
      metrics: {
        total,
        complete,
        percent,
        pendingApprovals,
        currentStageNo: current?.stageNo ?? null,
        currentStageName: current?.stageName ?? null,
        currentLevel: current?.drawingLevel ?? null,
      },
    };
  });
}
