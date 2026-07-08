import {
  KekaProviderError,
  type KekaDepartment,
  type KekaEmployee,
  type KekaProvider,
} from "@/lib/integrations/keka/types";

/**
 * Live Keka provider slot. Fails loud without KEKA_API_KEY / KEKA_BASE_URL —
 * a misconfigured deploy must not silently sync nothing. The request shape is
 * scaffolded; field mapping (Keka's employee/department payloads → our types)
 * lands with real API access and a sample response. See A-19.
 */
function readConfig(): { baseUrl: string; apiKey: string } {
  const baseUrl = process.env.KEKA_BASE_URL;
  const apiKey = process.env.KEKA_API_KEY;
  if (!baseUrl || !apiKey) {
    throw new KekaProviderError(
      "Keka provider 'http' is selected but not configured. Set KEKA_BASE_URL " +
        "and KEKA_API_KEY (see .env.example), or set config keka.provider to " +
        "'fixture' for development.",
    );
  }
  return { baseUrl, apiKey };
}

export const httpKekaProvider: KekaProvider = {
  name: "http",

  async fetchDepartments(): Promise<KekaDepartment[]> {
    readConfig();
    throw new KekaProviderError(
      "Live Keka department mapping is not implemented — awaiting API access " +
        "and a sample payload (A-19).",
    );
  },

  async fetchEmployees(): Promise<KekaEmployee[]> {
    readConfig();
    throw new KekaProviderError(
      "Live Keka employee mapping is not implemented — awaiting API access " +
        "and a sample payload (A-19).",
    );
  },
};
