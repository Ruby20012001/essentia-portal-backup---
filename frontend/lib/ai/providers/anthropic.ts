import Anthropic from "@anthropic-ai/sdk";
import {
  AiProviderError,
  type AiProvider,
  type AiResponse,
  type ResolvedAiRequest,
} from "@/lib/ai/types";

/**
 * Anthropic provider — the default (config `ai.provider` = "anthropic",
 * model from `ai.model`, currently claude-sonnet-4-6 per CLAUDE.md).
 * Uses the official SDK; it handles retries (429/5xx) and typed errors.
 */

const globalForAnthropic = globalThis as unknown as { anthropicClient?: Anthropic };

function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new AiProviderError(
      "ANTHROPIC_API_KEY is not set — see frontend/.env.example",
    );
  }
  globalForAnthropic.anthropicClient ??= new Anthropic();
  return globalForAnthropic.anthropicClient;
}

export const anthropicProvider: AiProvider = {
  name: "anthropic",

  async complete(request: ResolvedAiRequest): Promise<AiResponse> {
    const response = await getClient().messages.create({
      model: request.model,
      max_tokens: request.maxTokens,
      ...(request.system ? { system: request.system } : {}),
      messages: [{ role: "user", content: request.prompt }],
    });

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");

    return {
      text,
      provider: this.name,
      model: response.model,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      stopReason: response.stop_reason,
    };
  },
};
