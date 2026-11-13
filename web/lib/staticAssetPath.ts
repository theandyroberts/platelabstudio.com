const STATIC_PREFIXES = [
  "/media/",
  "/composite-review/media/",
  // "/stage" itself is a page; everything beneath it is the built viewer.
  "/stage/",
  "/imported-stage/",
  "/branding/",
];

/**
 * Public files that never depend on who is signed in: footage, posters, the
 * Lab viewer bundle and its models. A single clip is many requests, and none
 * of them should wait on a session check.
 */
export function isStaticAssetPath(pathname: string): boolean {
  return STATIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}
