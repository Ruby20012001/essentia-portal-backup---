import { NavGroups } from "@/components/shell/NavGroups";

/**
 * Desktop sidebar. Hidden below md (768px), where the fixed 256px column would
 * leave the content pane unusable and force the page to scroll horizontally —
 * on mobile the same navigation is reached through MobileNav's drawer.
 */
export function Sidebar({
  canSeeDecks,
  decks,
}: {
  canSeeDecks: boolean;
  decks: { id: string; name: string }[];
}) {
  return (
    <aside className="hidden w-64 shrink-0 flex-col gap-6 overflow-y-auto border-r border-brand-line bg-brand px-4 py-6 md:flex">
      <NavGroups canSeeDecks={canSeeDecks} decks={decks} />
    </aside>
  );
}
