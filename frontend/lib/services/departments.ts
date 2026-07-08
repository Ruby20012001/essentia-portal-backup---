import { query } from "@/lib/db";

/**
 * Department Master (foundation ruling #1). public.departments is the single
 * source of truth for the 24 departments — every module resolves departments
 * through this service; hardcoding a department name or code anywhere else
 * is a defect.
 */

export type Department = {
  id: string;
  code: string;
  name: string;
  vertical: "EE" | "EH" | "FACTORY" | "SHARED";
  parentId: string | null;
  isActive: boolean;
};

export type DepartmentNode = Department & { children: DepartmentNode[] };

type DepartmentRow = {
  id: string;
  code: string;
  name: string;
  vertical: Department["vertical"];
  parent_id: string | null;
  is_active: boolean;
};

const SELECT = `
  SELECT id, code, name, vertical, parent_id, is_active
  FROM public.departments
  ORDER BY vertical, sort_order, name`;

function toDepartment(row: DepartmentRow): Department {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    vertical: row.vertical,
    parentId: row.parent_id,
    isActive: row.is_active,
  };
}

export async function getDepartments(activeOnly = true): Promise<Department[]> {
  const rows = await query<DepartmentRow>(SELECT);
  const all = rows.map(toDepartment);
  return activeOnly ? all.filter((d) => d.isActive) : all;
}

/** Organization hierarchy: departments as a forest via parent_id. */
export async function getDepartmentTree(): Promise<DepartmentNode[]> {
  const flat = await getDepartments();
  const nodes = new Map<string, DepartmentNode>(
    flat.map((d) => [d.id, { ...d, children: [] }]),
  );
  const roots: DepartmentNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined;
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

export async function getDepartmentByCode(
  code: string,
): Promise<Department | null> {
  const rows = await query<DepartmentRow>(
    `SELECT id, code, name, vertical, parent_id, is_active
     FROM public.departments WHERE code = $1`,
    [code],
  );
  return rows[0] ? toDepartment(rows[0]) : null;
}
