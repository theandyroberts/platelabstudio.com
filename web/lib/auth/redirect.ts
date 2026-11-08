const FALLBACK_PATH = "/projects";

// Account access can open before the public catalog launches.
export function launchAccountRedirect(candidate: string | null | undefined): string {
  const path = safeRedirectPath(candidate, "/account");
  const pathname = new URL(path, "https://theplatelab.invalid").pathname;
  return ["/account", "/reset-password"].includes(pathname) ? path : "/account";
}

export function safeRedirectPath(
  candidate: string | null | undefined,
  fallback = FALLBACK_PATH,
): string {
  if (!candidate?.startsWith("/") || candidate.startsWith("//")) {
    return fallback;
  }

  try {
    const parsed = new URL(candidate, "https://theplatelab.invalid");
    if (parsed.origin !== "https://theplatelab.invalid") return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}
