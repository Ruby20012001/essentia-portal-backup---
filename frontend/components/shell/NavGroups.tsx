"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { visibleNav } from "@/components/shell/nav";

/**
 * The navigation list itself — shared by the desktop sidebar and the mobile
 * drawer so the two can never drift apart. `onNavigate` lets the drawer close
 * itself when a destination is chosen.
 */
export function NavGroups({
  onNavigate,
  canSeeDecks = true,
  decks = [],
  team = [],
}: {
  onNavigate?: () => void;
  /** Decided on the server, where the viewer is known — see visibleNav. */
  canSeeDecks?: boolean;
  /** Listed under Concept decks. Empty for anybody who cannot see them. */
  decks?: { id: string; name: string }[];
  /** Listed under the tracker. Empty for anybody who is not the head. */
  team?: { id: string; name: string }[];
}) {
  const pathname = usePathname();
  // Filtered by launch mode: a tracker-only deployment lists the tracker and
  // nothing else, rather than six headings over screens it does not serve.
  const groups = visibleNav(undefined, canSeeDecks, decks, team);

  return (
    <>
      {groups.map((group) => (
        <nav key={group.label} aria-label={group.label}>
          <p className="px-3 pb-2 font-body text-[10px] font-bold uppercase tracking-[0.22em] text-muted">
            {group.label}
          </p>
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const active =
                pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={`block rounded px-3 py-2 font-body text-sm transition-colors ${
                      active
                        ? "bg-selected font-normal text-white"
                        : "font-light text-secondary hover:bg-hover hover:text-white"
                    }`}
                  >
                    {item.label}
                  </Link>

                  {/* The decks under Concept decks — indented, one per line,
                      and each its own destination. The parent stays a link of
                      its own: it is still the page that lists every deck. */}
                  {item.children && item.children.length > 0 ? (
                    <ul className="mt-0.5 space-y-0.5 border-l border-line pl-2 ml-3">
                      {item.children.map((child) => {
                        const on = pathname === child.href;
                        return (
                          <li key={child.href}>
                            <Link
                              href={child.href}
                              onClick={onNavigate}
                              aria-current={on ? "page" : undefined}
                              className={`block rounded px-3 py-1.5 font-body text-[13px] transition-colors ${
                                on
                                  ? "bg-selected font-normal text-white"
                                  : "font-light text-muted hover:bg-hover hover:text-white"
                              }`}
                            >
                              {child.label}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </nav>
      ))}
    </>
  );
}
