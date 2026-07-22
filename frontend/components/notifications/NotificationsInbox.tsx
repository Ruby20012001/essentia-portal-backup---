"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Notification } from "@/lib/services/notifications";

/**
 * Notifications Center (Phase 4 frontend, screen 9) — the full-page inbox for a
 * user's own notifications. Consumes the existing in-app store only
 * (GET /api/notifications + the per-item read/archive/acknowledge routes); it
 * sends nothing and knows about no individual module. The header bell remains
 * the compact quick-view; this is the place to triage everything.
 */

type Tier = Notification["tier"];
type Status = "all" | "unread" | "read" | "archived";
const ALL_CAT = "__all__";

const TIER: Record<Tier, { dot: string; label: string; badge: string }> = {
  urgent: { dot: "bg-error", label: "Urgent", badge: "bg-error/10 text-error" },
  action_required: { dot: "bg-warning", label: "Action required", badge: "bg-warning/10 text-warning" },
  informational: { dot: "bg-muted", label: "FYI", badge: "bg-white/5 text-muted" },
};

const STATUSES: Status[] = ["all", "unread", "read", "archived"];

export function NotificationsInbox() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("all");
  const [category, setCategory] = useState<string>(ALL_CAT);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  // Categories accumulate (union) across loads so the filter never collapses
  // when a narrowing filter is applied.
  const [categories, setCategories] = useState<string[]>([]);
  const seenCats = useRef<Set<string>>(new Set());

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 200);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("status", status);
      if (category !== ALL_CAT) params.set("category", category);
      if (debounced) params.set("q", debounced);
      const res = await fetch(`/api/notifications?${params}`);
      if (res.ok) {
        const data = await res.json();
        const list: Notification[] = data.notifications ?? [];
        setItems(list);
        setUnread(data.unread ?? 0);
        let changed = false;
        for (const n of list) {
          if (n.category && !seenCats.current.has(n.category)) {
            seenCats.current.add(n.category);
            changed = true;
          }
        }
        if (changed) setCategories([...seenCats.current].sort());
      }
    } finally {
      setLoading(false);
    }
  }, [status, category, debounced]);

  useEffect(() => {
    load();
  }, [load]);

  async function act(id: string, path: string) {
    setBusy(id);
    try {
      await fetch(path, { method: "POST" });
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function open(n: Notification) {
    if (!n.readAt) await fetch(`/api/notifications/${n.id}/read`, { method: "POST" });
    if (n.actionUrl) router.push(n.actionUrl);
    else load();
  }

  async function markAllRead() {
    setBusy("__all__");
    try {
      await fetch("/api/notifications/mark-all-read", { method: "POST" });
      await load();
    } finally {
      setBusy(null);
    }
  }

  const countsLabel = useMemo(() => {
    const shown = items.length;
    return `${shown} ${status === "all" ? "" : status} notification${shown === 1 ? "" : "s"}`.replace("  ", " ");
  }, [items.length, status]);

  return (
    <div>
      {/* Summary + mark-all */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-card px-5 py-4">
        <div>
          <p className="font-heading text-2xl text-white">
            {unread} <span className="font-body text-sm font-light text-muted">unread</span>
          </p>
        </div>
        <button
          type="button"
          onClick={markAllRead}
          disabled={busy === "__all__" || unread === 0}
          className="rounded-lg border border-line-strong px-3 py-1.5 font-body text-xs font-bold text-white transition-colors hover:bg-hover disabled:opacity-40"
        >
          {busy === "__all__" ? "Marking…" : "Mark all read"}
        </button>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={`rounded-full px-3 py-1 font-body text-xs font-bold capitalize transition-colors ${
                status === s ? "bg-selected text-white" : "text-secondary hover:bg-hover hover:text-white"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search notifications…"
            aria-label="Search notifications"
            className="w-full rounded border border-line-strong bg-card px-3 py-2 font-body text-sm text-white placeholder:text-muted focus:border-white focus:outline-none sm:w-56"
          />
          <label className="flex items-center gap-2">
            <span className="sr-only">Category</span>
            <select
              aria-label="Category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="rounded border border-line-strong bg-card px-3 py-2 font-body text-sm text-secondary focus:border-white focus:outline-none"
            >
              <option value={ALL_CAT}>All categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {/* List */}
      {loading && items.length === 0 ? (
        <Empty>Loading notifications…</Empty>
      ) : items.length === 0 ? (
        <Empty>
          {status === "unread"
            ? "You're all caught up — no unread notifications."
            : status === "archived"
              ? "Nothing archived."
              : "Nothing here yet."}
        </Empty>
      ) : (
        <ul className="space-y-2">
          {items.map((n) => (
            <li
              key={n.id}
              className={`rounded-lg border border-line p-4 transition-colors hover:bg-hover ${
                n.readAt ? "bg-card" : "bg-warning/5"
              }`}
            >
              <div className="flex items-start gap-3">
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${TIER[n.tier].dot}`} aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    {n.actionUrl ? (
                      <button
                        type="button"
                        onClick={() => open(n)}
                        className={`break-words text-left font-body text-[15px] hover:underline ${
                          n.readAt ? "font-normal text-secondary" : "font-bold text-white"
                        }`}
                      >
                        {n.title}
                      </button>
                    ) : (
                      <span
                        className={`break-words font-body text-[15px] ${
                          n.readAt ? "font-normal text-secondary" : "font-bold text-white"
                        }`}
                      >
                        {n.title}
                      </span>
                    )}
                    <span className="shrink-0 font-body text-[11px] text-muted">{timeAgo(n.createdAt)}</span>
                  </div>

                  {n.body ? <p className="mt-1 break-words font-body text-sm font-light text-secondary">{n.body}</p> : null}

                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 font-body text-[10px] font-bold uppercase tracking-wide ${TIER[n.tier].badge}`}>
                      {TIER[n.tier].label}
                    </span>
                    {n.category ? (
                      <span className="rounded-full bg-white/5 px-2 py-0.5 font-body text-[10px] font-bold uppercase tracking-wide text-muted">
                        {n.category}
                      </span>
                    ) : null}
                    {n.acknowledgedAt ? <span className="font-body text-[10px] font-bold uppercase tracking-wide text-success">Acknowledged</span> : null}
                  </div>

                  {/* Actions */}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {n.actionUrl ? (
                      <button type="button" onClick={() => open(n)} className={ghost} disabled={busy === n.id}>
                        {n.actionLabel ?? "Open"}
                      </button>
                    ) : null}
                    {(n.tier === "urgent" || n.tier === "action_required") && !n.acknowledgedAt ? (
                      <button
                        type="button"
                        onClick={() => act(n.id, `/api/notifications/${n.id}/acknowledge`)}
                        className={ghost}
                        disabled={busy === n.id}
                      >
                        Acknowledge
                      </button>
                    ) : null}
                    {!n.readAt ? (
                      <button
                        type="button"
                        onClick={() => act(n.id, `/api/notifications/${n.id}/read`)}
                        className={ghost}
                        disabled={busy === n.id}
                      >
                        Mark read
                      </button>
                    ) : null}
                    {!n.archivedAt ? (
                      <button
                        type="button"
                        onClick={() => act(n.id, `/api/notifications/${n.id}/archive`)}
                        className={ghost}
                        disabled={busy === n.id}
                      >
                        Archive
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {loading && items.length > 0 ? (
        <p className="mt-3 font-body text-xs font-light text-muted">Refreshing…</p>
      ) : (
        <p className="mt-3 font-body text-xs font-light text-muted">{countsLabel}</p>
      )}
    </div>
  );
}

const ghost =
  "rounded-lg border border-line-strong px-3 py-1.5 font-body text-xs font-bold text-white transition-colors hover:bg-hover disabled:opacity-40";

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-line-strong bg-card px-5 py-12 text-center font-body text-sm font-light text-muted">
      {children}
    </p>
  );
}

function timeAgo(iso: string): string {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (!Number.isFinite(secs) || secs < 0) return "—";
  if (secs < 60) return "just now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}
