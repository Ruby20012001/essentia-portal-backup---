"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV } from "@/components/shell/nav";

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex w-64 shrink-0 flex-col gap-6 overflow-y-auto bg-espresso px-4 py-6">
      {NAV.map((group) => (
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
    </aside>
  );
}
