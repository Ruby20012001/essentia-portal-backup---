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

/**
 * A moment, in the time zone the company actually works in.
 *
 * Elsewhere in the portal a timestamp is rendered by slicing the ISO string,
 * which shows UTC. On an audit stamp that is untidy; on an interview it is a
 * missed interview — 11:30 in Gurugram renders as 06:00 and somebody believes
 * it. The zone is named rather than taken from the machine so the server and
 * the browser render the same string and hydration does not tear.
 */
const IST = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function formatIST(iso: string): string {
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? iso : IST.format(at).replace(",", "");
}

/**
 * A salary in lakhs, to the precision it was entered. formatINR rounds to one
 * decimal, which showed an asking of 4.55 lakh as ₹4.5L on the board while the
 * edit form said 4.55 — two screens disagreeing about what somebody asked for.
 */
export function formatLakhs(amount: number): string {
  if (Math.abs(amount) < 1_00_000) return `₹${amount.toLocaleString("en-IN")}`;
  return `₹${Number((amount / 1_00_000).toFixed(2))}L`;
}
