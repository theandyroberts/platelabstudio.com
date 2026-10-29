import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_COOKIE, verifySessionCookie } from "./sessionCore";
import { createClient } from "@/lib/supabase/server";
import { hasAdminRole } from "@/lib/auth/roles";

export { ADMIN_COOKIE, createSessionCookie, verifySessionCookie, checkPassword } from "./sessionCore";

export async function getAdminAccess(): Promise<"admin" | "customer" | "anonymous"> {
  const jar = await cookies();
  const v = jar.get(ADMIN_COOKIE)?.value;
  if (v && process.env.ADMIN_PASSWORD && verifySessionCookie(v)) return "admin";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const { data: staff, error } = await supabase.from("staff_users").select("role").eq("user_id", user.id).maybeSingle();
    if (!error && hasAdminRole(staff?.role)) return "admin";
    return "customer";
  }
  return "anonymous";
}

/** Call at the top of every admin page/action. */
export async function requireAdmin(): Promise<void> {
  const access = await getAdminAccess();
  if (access === "admin") return;
  if (access === "customer") redirect("/projects?error=Admin%20access%20is%20required.");
  redirect("/login?next=%2Fadmin");
}
