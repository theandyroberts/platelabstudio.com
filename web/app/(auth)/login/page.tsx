import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthRedirectPath } from "@/lib/auth/redirectServer";
import { createClient } from "@/lib/supabase/server";
import { signIn, signInWithGoogle, signUp } from "../actions";
import { TestLogins } from "@/components/TestLogins";
import { LoginMethods } from "@/components/LoginMethods";
import { Logo } from "@/components/Logo";
import { getSiteUrl } from "@/lib/auth/siteUrl";
import { isComingSoonHostname } from "@/lib/siteHosts";

type LoginPageProps = {
  searchParams: Promise<{
    error?: string;
    message?: string;
    mode?: string;
    next?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const next = await getAuthRedirectPath(params.next);
  const isSignup = params.mode === "signup";
  const launching = isComingSoonHostname(new URL(await getSiteUrl()).hostname);
  const googleEnabled =
    process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === "true";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) redirect(next);

  return (
    <main className="auth-shell">
      <div style={{ width: "min(100%, 520px)" }}>
      <section className="auth-card">
        <Logo />
        <p className="mono accent">{launching ? "Your Plate Lab account" : "Build your plate plan"}</p>
        <h1>{isSignup ? "Create your account" : "Welcome back"}</h1>
        <p className="auth-intro">
          {launching ? "Create an account or sign in ahead of the Plate Lab launch." : isSignup
            ? "Create a project, break down the scenes you need to shoot, then find the right environments for each one."
            : "Open your projects, scenes, selected clips, and THE LAB review setup."}
        </p>

        {params.error && <p className="auth-alert error">{params.error}</p>}
        {params.message && (
          <p className="auth-alert success">{params.message}</p>
        )}

        {googleEnabled && (
          <>
            <form action={signInWithGoogle} className="oauth-form">
              <input type="hidden" name="next" value={next} />
              <button type="submit" className="oauth-button">
                <span aria-hidden="true" className="google-mark">G</span>
                Continue with Google
              </button>
            </form>

            <div className="auth-divider">
              <span>or use your email</span>
            </div>
          </>
        )}

        <LoginMethods next={next} emailCode={process.env.AUTH_EMAIL_CODE_ENABLED === "true"} smsCode={false}>
        <form action={isSignup ? signUp : signIn} className="auth-form">
          <input type="hidden" name="next" value={next} />
          {isSignup && (
            <label>
              <span className="mono">Your name</span>
              <input
                name="displayName"
                type="text"
                autoComplete="name"
                maxLength={120}
                required
              />
            </label>
          )}
          <label>
            <span className="mono">Email</span>
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
            />
          </label>
          <label>
            <span className="mono">Password</span>
            <input
              name="password"
              type="password"
              autoComplete={isSignup ? "new-password" : "current-password"}
              minLength={isSignup ? 12 : undefined}
              required
            />
          </label>
          {isSignup && (
            <label>
              <span className="mono">Confirm password</span>
              <input
                name="passwordConfirmation"
                type="password"
                autoComplete="new-password"
                minLength={12}
                required
              />
            </label>
          )}
          <button type="submit" className="auth-submit">
            {isSignup ? "Create account" : "Sign in"}
          </button>
        </form>
        </LoginMethods>

        <div className="auth-links">
          {isSignup ? (
            <Link href={`/login?next=${encodeURIComponent(next)}`}>
              Already have an account?
            </Link>
          ) : (
            <>
              <Link href="/forgot-password">Forgot password?</Link>
              <Link
                href={`/login?mode=signup&next=${encodeURIComponent(next)}`}
              >
                Create an account
              </Link>
            </>
          )}
          <Link href="/">{launching ? "Return to homepage" : "Return to the catalog"}</Link>
        </div>
      </section>
      <TestLogins next={next} />
      </div>
    </main>
  );
}
