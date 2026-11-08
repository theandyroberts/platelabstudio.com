import { NextResponse, type NextRequest } from "next/server";
import { getAuthRedirectPath } from "@/lib/auth/redirectServer";
import { getSiteUrl } from "@/lib/auth/siteUrl";
import { cookies } from "next/headers";
import { ADMIN_COOKIE } from "@/lib/admin/sessionCore";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = await getAuthRedirectPath(request.nextUrl.searchParams.get("next"));
  const siteUrl = await getSiteUrl();

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      (await cookies()).delete(ADMIN_COOKIE);
      return NextResponse.redirect(new URL(next, siteUrl));
    }
  }

  const loginUrl = new URL("/login", siteUrl);
  loginUrl.searchParams.set(
    "error",
    "That authentication link is invalid or has expired.",
  );
  return NextResponse.redirect(loginUrl);
}
