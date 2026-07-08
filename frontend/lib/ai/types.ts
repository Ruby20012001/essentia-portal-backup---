/**
 * AI service abstraction (foundation ruling #5): the application depends on
 * this interface, never on a vendor SDK directly. Providers register in
 * lib/ai/index.ts; the active one is chosen by config key `ai.provider`.
 */

export type AiRequest = {
  /** Why this call is happening — recorded in the audit trail. */
  purpose: string;
  prompt: string;
  system?: string;
  /** Defaults to config `ai.model`. */
  model?: string;
  /** Defaults to 1024. */
  maxTokens?: number;
};

export type ResolvedAiRequest = AiRequest & { model: string; maxTokens: number };

export type AiResponse = {
  text: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  stopReason: string | null;
};

export interface AiProvider {
  readonly name: string;
  complete(request: ResolvedAiRequest): Promise<AiResponse>;
}

export class AiProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiProviderError";
  }
}
