import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import {
  canonicalWebHostname,
  hostnameFromHost,
  isComingSoonHostname,
} from "@/lib/siteHosts";

export async function middleware(request: NextRequest) {
  const hostname = hostnameFromHost(
    request.headers.get("x-forwarded-host") ?? request.headers.get("host"),
  );
  const canonicalHostname = canonicalWebHostname(hostname);

  if (canonicalHostname) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.protocol = "https";
    redirectUrl.hostname = canonicalHostname;
    redirectUrl.port = "";
    return NextResponse.redirect(redirectUrl, 308);
  }

  if (isComingSoonHostname(hostname)) {
    // The launch site stays independent of Supabase, including its direct URL.
    return request.nextUrl.pathname === "/coming-soon"
      ? NextResponse.next()
      : NextResponse.rewrite(new URL("/coming-soon", request.url));
  }

  // The local composite review reads generated files and needs no catalog DB.
  // Keep the exception restricted to loopback and these public review assets.
  if (process.env.PLATELAB_COMPOSITE_REVIEW === "1" &&
      ["127.0.0.1", "localhost", "[::1]"].includes(hostname) &&
      ["/review", "/api/composite-review", "/api/composite-feedback", "/media/composite", "/stage"].some(prefix => request.nextUrl.pathname === prefix || request.nextUrl.pathname.startsWith(prefix + "/"))) {
    return NextResponse.next();
  }

  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
