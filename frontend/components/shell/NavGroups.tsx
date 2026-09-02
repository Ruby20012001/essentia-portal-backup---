"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { visibleNav } from "@/lib/portal-mode";

/**
 * The navigation list itself — shared by the desktop sidebar and the mobile
 * drawer so the two can never drift apart. `onNavigate` lets the drawer close
 * itself when a destination is chosen.
 */
export function NavGroups({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  // Filtered by launch mode: a tracker-only deployment lists the tracker and
  // nothing else, rather than six headings over screens it does not serve.
  const groups = visibleNav();

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
                </li>
              );
            })}
          </ul>
        </nav>
      ))}
    </>
  );
}
