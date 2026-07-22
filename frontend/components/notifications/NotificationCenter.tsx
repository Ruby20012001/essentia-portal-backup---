"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Item = {
  id: string;
  tier: "urgent" | "action_required" | "informational";
  category: string | null;
  title: string;
  body: string | null;
  actionUrl: string | null;
  readAt: string | null;
  createdAt: string;
};

const TIER_DOT = {
  urgent: "bg-alert",
  action_required: "bg-amber",
  informational: "bg-navy",
} as const;

function timeAgo(iso: string): string {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return "just now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h`;
  return `${Math.floor(secs / 86400)}d`;
}

/**
 * Reusable Notification Center — bell + unread badge + panel with filters,
 * search, mark-all-read, per-item read/archive and deep links. Consumes the
 * in-app notification store (populated by the event framework); it does not
 * know about any individual module.
 */
export function NotificationCenter() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [unread, setUnread] = useState(0);
  const [tab, setTab] = useState<"all" | "unread">("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (tab === "unread") params.set("status", "unread");
      if (search.trim()) params.set("q", search.trim());
      const res = await fetch(`/api/notifications?${params}`);
      if (res.ok) {
        const data = await res.json();
        setItems(data.notifications ?? []);
        setUnread(data.unread ?? 0);
      }
    } finally {
      setLoading(false);
    }
  }, [tab, search]);

  // Poll the unread count so the badge stays fresh without opening the panel.
  useEffect(() => {
    let active = true;
    const tick = async () => {
      const res = await fetch("/api/notifications?status=unread");
      if (active && res.ok) setUnread((await res.json()).unread ?? 0);
    };
    tick();
    const t = setInterval(tick, 30_000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  async function openItem(item: Item) {
    if (!item.readAt) await fetch(`/api/notifications/${item.id}/read`, { method: "POST" });
    if (item.actionUrl) {
      setOpen(false);
      router.push(item.actionUrl);
    } else {
      load();
    }
  }

  async function archive(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    await fetch(`/api/notifications/${id}/archive`, { method: "POST" });
    load();
  }

  async function markAllRead() {
    await fetch("/api/notifications/mark-all-read", { method: "POST" });
    load();
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
        className="relative flex h-8 w-8 items-center justify-center rounded text-cream/80 transition-colors hover:bg-cream/10 hover:text-cream"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-alert px-1 font-body text-[10px] font-bold text-cream">
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 top-10 z-50 w-[360px] overflow-hidden rounded-lg border border-line bg-card">
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <span className="font-heading text-lg text-white">Notifications</span>
            <button
              type="button"
              onClick={markAllRead}
              className="font-body text-[11px] font-bold text-amber-deep hover:underline"
            >
              Mark all read
            </button>
          </div>

          <div className="flex items-center gap-2 border-b border-line px-4 py-2">
            {(["all", "unread"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`rounded-full px-2.5 py-0.5 font-body text-[11px] font-bold capitalize ${
                  tab === t ? "bg-selected text-white" : "text-label hover:text-ink"
                }`}
              >
                {t}
              </button>
            ))}
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
              className="ml-auto w-28 rounded border border-line-strong bg-card px-2 py-1 font-body text-xs text-ink focus:w-36 focus:outline-none"
            />
          </div>

          <div className="max-h-[380px] overflow-y-auto">
            {loading && items.length === 0 ? (
              <p className="px-4 py-8 text-center font-body text-sm font-light text-label">Loading…</p>
            ) : items.length === 0 ? (
              <p className="px-4 py-8 text-center font-body text-sm font-light text-label">
                {tab === "unread" ? "No unread notifications." : "Nothing here yet."}
              </p>
            ) : (
              <ul>
                {items.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => openItem(item)}
                      className={`group flex w-full items-start gap-2.5 border-b border-line px-4 py-3 text-left transition-colors hover:bg-hover ${
                        item.readAt ? "" : "bg-amber/5"
                      }`}
                    >
                      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${TIER_DOT[item.tier]}`} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className={`font-body text-[13px] ${item.readAt ? "font-normal text-ink" : "font-bold text-white"}`}>
                            {item.title}
                          </span>
                          <span className="shrink-0 font-body text-[10px] text-label">{timeAgo(item.createdAt)}</span>
                        </span>
                        {item.body ? (
                          <span className="mt-0.5 block font-body text-xs font-light text-label">{item.body}</span>
                        ) : null}
                      </span>
                      <span
                        onClick={(e) => archive(item.id, e)}
                        className="ml-1 shrink-0 rounded px-1 font-body text-[10px] font-bold text-label opacity-0 hover:text-alert group-hover:opacity-100"
                        role="button"
                        aria-label="Archive"
                      >
                        ✕
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <Link
            href="/notifications"
            onClick={() => setOpen(false)}
            className="block border-t border-line px-4 py-2.5 text-center font-body text-[11px] font-bold text-amber-deep hover:underline"
          >
            View all notifications
          </Link>
        </div>
      ) : null}
    </div>
  );
}
