import { headers } from "next/headers";
import { signIn } from "@/app/(auth)/actions";
import { testLoginsForEnvironment } from "@/lib/auth/testLogins";
import styles from "./TestLogins.module.css";

export async function TestLogins({ next }: { next: string }) {
  const requestHeaders = await headers();
  const accounts = testLoginsForEnvironment(requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host"), process.env);
  if (!accounts) return null;
  return <section className={styles.panel} aria-labelledby="test-logins-heading">
    <h2 id="test-logins-heading">Test logins</h2>
    {(["customer", "admin"] as const).map(role => (
      <div className={styles.account} key={role}>
        <h3>{role === "customer" ? "Customer" : "Admin"}</h3>
        <dl>
          <dt>Email</dt><dd><code>{accounts[role].email}</code></dd>
          <dt>Password</dt><dd><code>{accounts[role].password}</code></dd>
        </dl>
        <form action={signIn}>
          <input type="hidden" name="email" value={accounts[role].email} />
          <input type="hidden" name="password" value={accounts[role].password} />
          <input type="hidden" name="next" value={role === "admin" ? "/admin" : next.startsWith("/admin") ? "/projects" : next} />
          <button type="submit" className="secondary-button">Sign in as {role}</button>
        </form>
      </div>
    ))}
  </section>;
}
