import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { getAuthRedirectPath } from "@/lib/auth/redirectServer";
import { getSiteUrl } from "@/lib/auth/siteUrl";
import { cookies } from "next/headers";
import { ADMIN_COOKIE } from "@/lib/admin/sessionCore";
import { createClient } from "@/lib/supabase/server";

const OTP_TYPES = new Set<EmailOtpType>([
  "email",
  "email_change",
  "invite",
  "magiclink",
  "recovery",
  "signup",
]);

function isEmailOtpType(value: string | null): value is EmailOtpType {
  return value !== null && OTP_TYPES.has(value as EmailOtpType);
}

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");
  const requestedNext = request.nextUrl.searchParams.get("next");
  const next = await getAuthRedirectPath(
    requestedNext ?? (type === "recovery" ? "/reset-password" : "/projects"),
  );
  const siteUrl = await getSiteUrl();

  if (tokenHash && isEmailOtpType(type)) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });

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
