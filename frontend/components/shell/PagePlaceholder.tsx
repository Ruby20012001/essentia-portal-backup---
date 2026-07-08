import { EmptyState } from "@/components/ui/EmptyState";

/**
 * Empty-page stub used by every Sprint 2.1 route. Screens are intentionally
 * empty — real content is built in Sprints 2.2 / 2.3. Each page declares its
 * title and the brief section that will govern it, so the inventory is traceable.
 */
export function PagePlaceholder({
  title,
  section,
}: {
  title: string;
  section: string;
}) {
  return (
    <div>
      <h1 className="mb-1 font-heading text-4xl text-espresso">{title}</h1>
      <p className="mb-8 font-body text-sm font-light text-label">{section}</p>
      <EmptyState
        title="Screen not built yet"
        message="This route is a Sprint 2.1 scaffold placeholder."
      />
    </div>
  );
}
