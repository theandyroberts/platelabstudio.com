"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ADMIN_COOKIE } from "@/lib/admin/sessionCore";
import { getAuthRedirectPath } from "@/lib/auth/redirectServer";
import { codeChannelEnabled, normalizeCodeDestination, normalizeLoginCode, type LoginCodeState } from "@/lib/auth/loginCode";

export async function submitLoginCode(_previous: LoginCodeState, form: FormData): Promise<LoginCodeState> {
  const text = (key: string) => typeof form.get(key) === "string" ? String(form.get(key)) : "";
  const channel = text("channel");
  if ((channel !== "email" && channel !== "sms") || !codeChannelEnabled(channel, process.env)) {
    return { step: "send", channel: "email", destination: "", error: "This sign-in method is not available. Choose another option." };
  }
  const destination = normalizeCodeDestination(channel, text("destination"));
  if (!destination) return { step: "send", channel, destination: "", error: channel === "email" ? "Enter a valid email address." : "Enter your mobile number with its country code, such as +1 212 555 0123." };
  const state: LoginCodeState = { step: "verify", channel, destination };
  const verify = text("operation") === "verify";
  const token = normalizeLoginCode(text("code"));
  if (verify && !token) return { ...state, error: "Enter the six-digit code from your message." };

  const supabase = await createClient();
  try {
    if (verify) {
      const { data, error } = await supabase.auth.verifyOtp(channel === "email"
        ? { email: destination, token: token!, type: "email" }
        : { phone: destination, token: token!, type: "sms" });
      if (error || !data.session) return { ...state, error: "That code is invalid or expired. Try again or request a new code." };
    } else {
      const { error } = await supabase.auth.signInWithOtp(channel === "email"
        ? { email: destination, options: { shouldCreateUser: true } }
        : { phone: destination, options: { shouldCreateUser: true, channel: "sms" } });
      if (error) return { ...state, step: _previous.step, error: "We couldn’t send a code. Wait a minute and try again, or use another sign-in option." };
      return { ...state, message: `Check your ${channel === "email" ? "email" : "text messages"} for a six-digit code. A new code replaces the previous one.` };
    }
  } catch {
    return { ...state, step: verify ? "verify" : _previous.step, error: "Sign-in is temporarily unavailable. Please try again." };
  }
  // Match password login: an old shared admin cookie must not grant privileges.
  (await cookies()).delete(ADMIN_COOKIE);
  redirect(await getAuthRedirectPath(text("next")));
}
