import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import { createClient } from "@/lib/supabase/server";
import { getSiteUrl } from "@/lib/auth/siteUrl";
import { isComingSoonHostname } from "@/lib/siteHosts";
import { signOut } from "../(auth)/actions";

export default async function AccountPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=%2Faccount");
  const launching = isComingSoonHostname(new URL(await getSiteUrl()).hostname);
  return <main className="auth-shell"><section className="auth-card">
    <Logo />
    <p className="mono accent" style={{marginTop: 28}}>Your Plate Lab account</p>
    <h1>You’re signed in.</h1>
    <p className="auth-intro">{user.email || user.phone}</p>
    <p className="auth-intro">{launching ? "Your account is ready. The Plate Lab catalog and project tools will open here at launch." : "Your projects and selected plates are ready to review."}</p>
    <div className="auth-links"><Link href={launching ? "/" : "/projects"}>{launching ? "Back to Plate Lab" : "Open your projects"}</Link><form action={signOut}><button type="submit">Log out</button></form></div>
  </section></main>;
}
