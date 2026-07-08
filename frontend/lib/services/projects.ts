import { withUserContext } from "@/lib/db";
import type { SessionUser } from "@/lib/auth/session";

export type ProjectOption = {
  id: string;
  projectCode: string;
  projectName: string | null;
};

/** RLS-scoped project options (pickers). The user sees only their projects. */
export async function listProjectOptions(
  user: SessionUser,
): Promise<ProjectOption[]> {
  return withUserContext(user, async (q) => {
    const rows = await q<{
      id: string;
      project_code: string;
      project_name: string | null;
    }>(
      `SELECT id, project_code, project_name
       FROM ee.projects
       WHERE is_active
       ORDER BY project_code`,
    );
    return rows.map((r) => ({
      id: r.id,
      projectCode: r.project_code,
      projectName: r.project_name,
    }));
  });
}
