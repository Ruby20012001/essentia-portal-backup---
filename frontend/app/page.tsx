import { redirect } from "next/navigation";
import { homeHref } from "@/lib/portal-mode";

/**
 * "/" goes to whatever this deployment's home actually is — the dashboard in a
 * full portal, the tracker in a tracker-only launch. Hardcoding /dashboard sent
 * a tracker-only deployment to a screen it does not serve.
 */
export default function Home() {
  redirect(homeHref());
}
