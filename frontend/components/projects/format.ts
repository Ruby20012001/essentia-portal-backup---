import type { Rag } from "@/lib/services/project-hub";

/** "design_conceptualisation" → "Design Conceptualisation"; keeps small words low. */
export function phaseLabel(phase: string): string {
  return phase
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
    .replace(/\bOf\b/g, "of")
    .replace(/\bAnd\b/g, "and");
}

/** Indian-format money: 50000000 → "₹5.00 Cr", 250000 → "₹2.50 L". */
export function inr(v: number | null): string {
  if (v == null) return "—";
  if (Math.abs(v) >= 1e7) return `₹${(v / 1e7).toFixed(2)} Cr`;
  if (Math.abs(v) >= 1e5) return `₹${(v / 1e5).toFixed(2)} L`;
  return `₹${Math.round(v).toLocaleString("en-IN")}`;
}

export const RAG_META: Record<Rag, { cls: string; label: string }> = {
  red: { cls: "bg-error/10 text-error", label: "Red" },
  amber: { cls: "bg-warning/10 text-warning", label: "Amber" },
  green: { cls: "bg-success/10 text-success", label: "Green" },
};

export const ragBadgeClass = (rag: Rag): string =>
  `inline-block rounded-full px-2 py-0.5 font-body text-[10px] font-bold uppercase tracking-wide ${RAG_META[rag].cls}`;
