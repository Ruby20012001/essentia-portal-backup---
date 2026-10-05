/**
 * S13 · API Health — the rules, with no database (Blueprint §09). Eleven
 * integrations, meant to be pinged every five minutes into
 * portal.api_health_log. The screen must never show green for something
 * nobody checked: no check is "Never checked", an old check is "Stale".
 */

export const PULSE_MINUTES = 5;
/** Three missed pulses and the last result no longer describes now. */
export const STALE_AFTER_MINUTES = 15;

export type ApiName =
  | "tranzact"
  | "hubspot"
  | "keka"
  | "zakya"
  | "whatsapp"
  | "microsoft_graph"
  | "twilio"
  | "monday_com"
  | "google_drive"
  | "anthropic"
  | "visioncam";

/** How far the portal's own side of the integration is built. */
export type Wiring = "Live" | "Test data" | "Not configured" | "Not built";

export const INTEGRATIONS: { key: ApiName; label: string; powers: string }[] = [
  { key: "tranzact", label: "TranZact ERP", powers: "Procurement, POs and GRNs" },
  { key: "hubspot", label: "HubSpot CRM", powers: "BD pipeline" },
  { key: "keka", label: "Keka HRIS", powers: "Staff, exits and vacancies" },
  { key: "zakya", label: "Zakya POS", powers: "EH sales and stock" },
  { key: "whatsapp", label: "WhatsApp API", powers: "Client and team messages" },
  { key: "microsoft_graph", label: "Microsoft Graph", powers: "Email and calendar" },
  { key: "twilio", label: "Twilio OTP", powers: "Client and vendor sign-in codes" },
  { key: "monday_com", label: "monday.com", powers: "Legacy task boards" },
  { key: "google_drive", label: "Google Drive", powers: "GFC drawings" },
  { key: "anthropic", label: "Anthropic AI", powers: "Advisory answers" },
  { key: "visioncam", label: "VisionCAM", powers: "Site photos that trigger billing" },
];

export type LatestCheck = {
  integration: ApiName;
  status: string;
  checkedAt: string;
  responseMs: number | null;
  error: string | null;
};

export type FailureState = {
  integration: ApiName;
  consecutiveFailures: number;
  firstFailureAt: string | null;
  degraded: boolean;
};

export type HealthState = "Healthy" | "Degraded" | "Down" | "Stale" | "Never checked";

export type IntegrationRow = {
  key: ApiName;
  label: string;
  powers: string;
  wiring: Wiring;
  state: HealthState;
  checkedAt: string | null;
  responseMs: number | null;
  error: string | null;
  failures: number;
};

export function healthState(check: LatestCheck | undefined, now: Date): HealthState {
  if (!check) return "Never checked";
  const age = (now.getTime() - new Date(check.checkedAt).getTime()) / 60_000;
  if (age > STALE_AFTER_MINUTES) return "Stale";
  if (check.status === "healthy") return "Healthy";
  if (check.status === "down") return "Down";
  return "Degraded";
}

export function buildRows(
  checks: LatestCheck[],
  failures: FailureState[],
  wiring: Partial<Record<ApiName, Wiring>>,
  now: Date,
): IntegrationRow[] {
  return INTEGRATIONS.map((i) => {
    const check = checks.find((c) => c.integration === i.key);
    const fail = failures.find((f) => f.integration === i.key);
    return {
      ...i,
      wiring: wiring[i.key] ?? "Not built",
      state: healthState(check, now),
      checkedAt: check?.checkedAt ?? null,
      responseMs: check?.responseMs ?? null,
      error: check?.error ?? null,
      failures: fail?.consecutiveFailures ?? 0,
    };
  });
}

export type HealthSummary = {
  healthy: number;
  total: number;
  problems: IntegrationRow[];
  unmonitored: number;
  /** Mean response of the integrations that are healthy right now; null if none. */
  avgMs: number | null;
  /** Healthy checks ÷ all checks today, as a percentage; null when nothing was checked. */
  uptimePct: number | null;
};

export function summarise(rows: IntegrationRow[], today: { total: number; healthy: number }): HealthSummary {
  const healthy = rows.filter((r) => r.state === "Healthy");
  const timed = healthy.filter((r) => r.responseMs !== null);
  return {
    healthy: healthy.length,
    total: rows.length,
    problems: rows.filter((r) => r.state === "Degraded" || r.state === "Down"),
    unmonitored: rows.filter((r) => r.state === "Never checked" || r.state === "Stale").length,
    avgMs: timed.length ? Math.round(timed.reduce((s, r) => s + (r.responseMs ?? 0), 0) / timed.length) : null,
    uptimePct: today.total > 0 ? Math.round((today.healthy / today.total) * 1000) / 10 : null,
  };
}
