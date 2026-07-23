"use client";

import { useRouter } from "next/navigation";
import type { ProjectOption } from "@/lib/services/projects";

/** Switch which project the Design Room is showing (navigates to ?project=id). */
export function ProjectSwitcher({ projects, currentId }: { projects: ProjectOption[]; currentId: string }) {
  const router = useRouter();
  return (
    <label className="flex items-center gap-2">
      <span className="sr-only">Switch project</span>
      <select
        aria-label="Switch project"
        value={currentId}
        onChange={(e) => router.push(`/design-room?project=${e.target.value}`)}
        className="rounded border border-line-strong bg-card px-3 py-2 font-body text-sm text-secondary focus:border-white focus:outline-none"
      >
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.projectCode}
            {p.projectName ? ` · ${p.projectName}` : ""}
          </option>
        ))}
      </select>
    </label>
  );
}
