import { getConfig } from "@/lib/services/config";
import { fixtureKekaProvider } from "@/lib/integrations/keka/providers/fixture";
import { httpKekaProvider } from "@/lib/integrations/keka/providers/http";
import { KekaProviderError, type KekaProvider } from "@/lib/integrations/keka/types";

const PROVIDERS: Record<string, KekaProvider> = {
  [fixtureKekaProvider.name]: fixtureKekaProvider,
  [httpKekaProvider.name]: httpKekaProvider,
};

export async function getKekaProvider(): Promise<KekaProvider> {
  const name = await getConfig<string>("keka.provider", "fixture");
  const provider = PROVIDERS[name];
  if (!provider) {
    throw new KekaProviderError(
      `Unknown Keka provider '${name}' — valid: ${Object.keys(PROVIDERS).join(", ")} (config keka.provider)`,
    );
  }
  return provider;
}

export { KekaProviderError } from "@/lib/integrations/keka/types";
