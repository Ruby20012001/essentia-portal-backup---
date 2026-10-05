/**
 * S16 · Knowledge Library — the rules, with no database (Brief §32). The
 * Wednesday Year sessions, in six tracks. One track, Strategic Leadership,
 * is L0/L1 only: the service filters it out of every query for anyone else,
 * so it is never fetched for them, not merely not shown.
 */

export const TRACKS = [
  { name: "Site Supervision", leadershipOnly: false },
  { name: "PMC & Client Advisory", leadershipOnly: false },
  { name: "Design & 3D", leadershipOnly: false },
  { name: "Manufacturing", leadershipOnly: false },
  { name: "Experience Centre", leadershipOnly: false },
  { name: "Strategic Leadership", leadershipOnly: true },
] as const;

export type TrackName = (typeof TRACKS)[number]["name"];

export const CONTENT_TYPES = [
  { key: "craft_wednesday", label: "Craft Wednesday" },
  { key: "strategic_wednesday", label: "Strategic Wednesday" },
  { key: "case_study", label: "Case study" },
  { key: "sop", label: "SOP" },
] as const;

export type ContentType = (typeof CONTENT_TYPES)[number]["key"];

type Level = "L0" | "L1" | "L2" | "L3";

export function isLeadership(level: Level): boolean {
  return level === "L0" || level === "L1";
}

/** The tracks this viewer may read — and therefore the only ones ever queried for them. */
export function visibleTracks(level: Level): TrackName[] {
  return TRACKS.filter((t) => !t.leadershipOnly || isLeadership(level)).map((t) => t.name);
}

export function contentTypeLabel(key: string | null): string | null {
  if (!key) return null;
  return CONTENT_TYPES.find((c) => c.key === key)?.label ?? key;
}

/** "Monsoon, carpentry ,, wood" → ["Monsoon","carpentry","wood"]: trimmed, de-duplicated ignoring case, at most 12. */
export function parseTags(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(",")) {
    const t = part.trim().slice(0, 40);
    if (!t || seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase());
    out.push(t);
    if (out.length === 12) break;
  }
  return out;
}

/**
 * About 240 characters of the content. With a search, the window starts
 * near the first word that matched, so the reader sees why it came up.
 */
export function excerpt(content: string, query = "", size = 240): string {
  const text = content.replace(/\s+/g, " ").trim();
  if (text.length <= size) return text;
  const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  const lower = text.toLowerCase();
  const hits = words.map((w) => lower.indexOf(w)).filter((i) => i >= 0);
  const at = hits.length ? Math.min(...hits) : 0;
  const start = Math.max(0, Math.min(at - 60, text.length - size));
  const cut = text.slice(start, start + size);
  // Snap to whole words at both ends.
  const left = start > 0 ? cut.slice(cut.indexOf(" ") + 1) : cut;
  const right = start + size < text.length ? left.slice(0, left.lastIndexOf(" ")) : left;
  return `${start > 0 ? "… " : ""}${right}${start + size < text.length ? " …" : ""}`;
}
