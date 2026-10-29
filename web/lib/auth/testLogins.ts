import { hostnameFromHost, isStagingHostname } from "../siteHosts";

const localHostnames = new Set(["localhost", "127.0.0.1", "[::1]"]);
const allowedSite = (hostname: string) => localHostnames.has(hostname) || isStagingHostname(hostname);

export function testLoginsForEnvironment(host: string | null, env: Record<string, string | undefined>) {
  if (env.SHOW_TEST_LOGINS !== "true") return null;
  try {
    // Host headers alone must never expose credentials on a production deployment.
    if (!allowedSite(hostnameFromHost(host)) || !allowedSite(new URL(env.NEXT_PUBLIC_SITE_URL || "").hostname)) return null;
    const backend = new URL(env.NEXT_PUBLIC_SUPABASE_URL || "").hostname;
    if (backend !== "supabase-staging.theplatelab.site" && !localHostnames.has(backend)) return null;
  } catch { return null; }
  const customer = { email: env.TEST_CUSTOMER_EMAIL, password: env.TEST_CUSTOMER_PASSWORD };
  const admin = { email: env.TEST_ADMIN_EMAIL, password: env.TEST_ADMIN_PASSWORD };
  if (!customer.email || !customer.password || !admin.email || !admin.password) return null;
  return { customer: { email: customer.email, password: customer.password }, admin: { email: admin.email, password: admin.password } };
}
