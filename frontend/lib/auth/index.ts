import { getConfig } from "@/lib/services/config";
import { localPasswordProvider } from "@/lib/auth/providers/local-password";
import { entraProvider } from "@/lib/auth/providers/entra";
import { AuthProviderError } from "@/lib/auth/providers/types";
import type { AuthProvider } from "@/lib/auth/providers/types";

/**
 * Auth provider registry. The active provider is chosen by config
 * `auth.provider` — swapping identity systems is configuration, not code.
 */
const PROVIDERS: Record<string, AuthProvider> = {
  [localPasswordProvider.name]: localPasswordProvider,
  [entraProvider.name]: entraProvider,
};

export async function getActiveProvider(): Promise<AuthProvider> {
  const name = await getConfig<string>("auth.provider", "local");
  const provider = PROVIDERS[name];
  if (!provider) {
    throw new AuthProviderError(
      `Unknown auth provider '${name}' — valid: ${Object.keys(PROVIDERS).join(", ")} (config auth.provider)`,
    );
  }
  return provider;
}

export { AuthProviderError } from "@/lib/auth/providers/types";
