import { query } from "@/lib/db";

/** User & role mapping — level and department come from the database. */

export type PortalUser = {
  id: string;
  email: string;
  name: string;
  accessLevel: "L0" | "L1" | "L2" | "L3";
  departmentId: string | null;
  departmentCode: string | null;
  jobTitle: string | null;
  isActive: boolean;
};

export async function getUserById(id: string): Promise<PortalUser | null> {
  const rows = await query<{
    id: string;
    email: string;
    name: string;
    access_level: PortalUser["accessLevel"];
    department_id: string | null;
    department_code: string | null;
    job_title: string | null;
    is_active: boolean;
  }>(
    `SELECT u.id, u.email, COALESCE(u.display_name, u.full_name) AS name,
            u.access_level, u.department_id, d.code AS department_code,
            u.job_title, u.is_active
     FROM public.users u
     LEFT JOIN public.departments d ON d.id = u.department_id
     WHERE u.id = $1`,
    [id],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    accessLevel: row.access_level,
    departmentId: row.department_id,
    departmentCode: row.department_code,
    jobTitle: row.job_title,
    isActive: row.is_active,
  };
}
