import "server-only";
import { getSiteUrl } from "./siteUrl";
import { safeRedirectPath, launchAccountRedirect } from "./redirect";
import { isComingSoonHostname } from "../siteHosts";

export async function getAuthRedirectPath(candidate: string | null | undefined) {
  const site = await getSiteUrl();
  return isComingSoonHostname(new URL(site).hostname)
    ? launchAccountRedirect(candidate) : safeRedirectPath(candidate);
}
