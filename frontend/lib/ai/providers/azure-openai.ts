import {
  AiProviderError,
  type AiProvider,
  type AiResponse,
  type ResolvedAiRequest,
} from "@/lib/ai/types";

/**
 * Azure OpenAI provider slot (foundation ruling #5: the provider must be
 * replaceable). Registered but not implemented — switching config
 * `ai.provider` to "azure_openai" fails loudly instead of silently falling
 * back, so a misconfiguration can never route traffic to the wrong vendor.
 */
export const azureOpenAiProvider: AiProvider = {
  name: "azure_openai",

  async complete(_request: ResolvedAiRequest): Promise<AiResponse> {
    throw new AiProviderError(
      "The azure_openai provider is registered but not configured. " +
        "Implement lib/ai/providers/azure-openai.ts (AZURE_OPENAI_ENDPOINT / " +
        "AZURE_OPENAI_API_KEY) before setting app_config ai.provider to it.",
    );
  },
};
