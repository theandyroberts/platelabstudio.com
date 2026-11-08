import {plateActionReturnPath} from "@/lib/plateActions";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SceneGrid } from "@/components/SceneGrid";


type NewProjectPageProps = {
  searchParams: Promise<{ error?: string; save?: string; plateReturn?: string }>;
};

export const dynamic = "force-dynamic";

export default async function NewProjectPage({
  searchParams,
}: NewProjectPageProps) {
  const params = await searchParams;
  const plateReturn=plateActionReturnPath(params.plateReturn);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user&&plateReturn) redirect(`/login?next=${encodeURIComponent(`/projects/new?plateReturn=${encodeURIComponent(plateReturn)}`)}`);
  if (!user) redirect(`/login?next=${encodeURIComponent(`/projects/new${params.save ? `?save=${encodeURIComponent(params.save)}` : ""}`)}`);

  const [{ data: profile }, { data: membership }] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("organization_memberships")
      .select("organization_id, organizations(name)")
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("created_at")
      .limit(1)
      .maybeSingle(),
  ]);

  const organization = membership?.organizations;

  return (
    <main className="workspace-shell narrow-workspace new-project-workspace">
      <header className="lab-task-header">
        <div>
          <Link href="/projects" className="mono dim back-link">
            ← Projects
          </Link>
          <h1>New project</h1>
        </div>
        <div className="lab-task-meta mono">
          {organization?.name && <span>{organization.name}</span>}
        </div>
      </header>

      {params.error && <p className="auth-alert error">{params.error}</p>}

      <SceneGrid organizationName={organization?.name} displayName={profile?.display_name ?? undefined} saveSku={params.save} plateReturn={plateReturn ?? undefined} />
    </main>
  );
}
