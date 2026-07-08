import { query } from "@/lib/db";
import { getConfig } from "@/lib/services/config";
import { writeAudit } from "@/lib/services/audit";
import { requirePermission } from "@/lib/services/permissions";
import { anthropicProvider } from "@/lib/ai/providers/anthropic";
import { azureOpenAiProvider } from "@/lib/ai/providers/azure-openai";
import { copilotProvider } from "@/lib/ai/providers/copilot";
import {
  AiProviderError,
  type AiProvider,
  type AiRequest,
  type AiResponse,
} from "@/lib/ai/types";
import type { SessionUser } from "@/lib/auth/session";

/**
 * The AI service every module calls. Vendor-neutral by construction:
 * provider resolved from config `ai.provider`, model from `ai.model`,
 * prompts from portal.ai_prompts. Every call is permission-gated
 * (ai_access) and audited with purpose + token usage.
 */

const PROVIDERS: Record<string, AiProvider> = {
  [anthropicProvider.name]: anthropicProvider,
  [azureOpenAiProvider.name]: azureOpenAiProvider,
  [copilotProvider.name]: copilotProvider,
};

export async function aiComplete(
  user: SessionUser,
  request: AiRequest,
): Promise<AiResponse> {
  await requirePermission(user, "ai_access", "ai");

  const providerName = await getConfig<string>("ai.provider", "anthropic");
  const provider = PROVIDERS[providerName];
  if (!provider) {
    throw new AiProviderError(
      `Unknown AI provider '${providerName}' — valid values: ${Object.keys(PROVIDERS).join(", ")} (app_config key ai.provider)`,
    );
  }

  const response = await provider.complete({
    ...request,
    model: request.model ?? (await getConfig<string>("ai.model", "claude-sonnet-4-6")),
    maxTokens: request.maxTokens ?? 1024,
  });

  await writeAudit({
    userId: user.id,
    role: user.accessLevel,
    action: "AI_CALL",
    resourceType: "ai",
    newValues: {
      purpose: request.purpose,
      provider: response.provider,
      model: response.model,
      inputTokens: response.inputTokens,
      outputTokens: response.outputTokens,
      stopReason: response.stopReason,
    },
  });

  return response;
}

/**
 * Modular prompt architecture: prompts live in portal.ai_prompts, owned by
 * their modules (Communication Spine letters, Priority Signals, ...).
 * Templates use {{var}} placeholders.
 */
export async function aiCompleteFromPrompt(
  user: SessionUser,
  promptCode: string,
  vars: Record<string, string | number>,
): Promise<AiResponse> {
  const [prompt] = await query<{
    system_template: string;
    user_template: string;
    model_override: string | null;
    max_tokens: number;
  }>(
    `SELECT system_template, user_template, model_override, max_tokens
     FROM portal.ai_prompts WHERE code = $1 AND is_active`,
    [promptCode],
  );
  if (!prompt) {
    throw new AiProviderError(
      `Unknown AI prompt '${promptCode}' — prompts live in portal.ai_prompts`,
    );
  }

  const render = (template: string) =>
    template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) =>
      key in vars ? String(vars[key]) : `{{${key}}}`,
    );

  return aiComplete(user, {
    purpose: `prompt:${promptCode}`,
    system: render(prompt.system_template),
    prompt: render(prompt.user_template),
    model: prompt.model_override ?? undefined,
    maxTokens: prompt.max_tokens,
  });
}
