import {
  AiProviderError,
  type AiProvider,
  type AiResponse,
  type ResolvedAiRequest,
} from "@/lib/ai/types";

/**
 * Microsoft Copilot provider slot (the brief's §2 names M365 Copilot as a
 * candidate — see docs/BRIEF_DISCREPANCIES.md item 10). Registered but not
 * implemented; selecting it fails loudly rather than silently degrading.
 */
export const copilotProvider: AiProvider = {
  name: "copilot",

  async complete(_request: ResolvedAiRequest): Promise<AiResponse> {
    throw new AiProviderError(
      "The copilot provider is registered but not configured. Implement " +
        "lib/ai/providers/copilot.ts (Microsoft Graph credentials) before " +
        "setting app_config ai.provider to it.",
    );
  },
};
