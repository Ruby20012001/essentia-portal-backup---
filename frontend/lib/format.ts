/** ₹ formatting in Indian units — 1,50,000 → "₹1.5L", 2,30,00,000 → "₹2.3Cr". */
export function formatINR(amount: number): string {
  const abs = Math.abs(amount);
  if (abs >= 1_00_00_000) return `₹${(amount / 1_00_00_000).toFixed(1)}Cr`;
  if (abs >= 1_00_000) return `₹${(amount / 1_00_000).toFixed(1)}L`;
  return `₹${amount.toLocaleString("en-IN")}`;
}

/** "design_development" → "Design Development"; DoR keeps its brand name. */
export function formatPhase(phase: string): string {
  if (phase === "day_of_recognition") return "Day of Recognition";
  return phase
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
