import { notFound, redirect } from "next/navigation";
import { sceneSearchHref } from "@/lib/sceneSearch";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Keep existing scene bookmarks working without maintaining a second search engine.
export default async function ScenePage({ params, searchParams }: {
  params: Promise<{ projectId: string; sceneId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { projectId, sceneId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/projects/${projectId}/scenes/${sceneId}`)}`);
  const { data: scene } = await supabase.from("scenes")
    .select("id, name, search_brief").eq("id", sceneId)
    .eq("project_id", projectId).is("archived_at", null).maybeSingle();
  if (!scene) notFound();
  const { error } = await searchParams;
  if (error) redirect(`${sceneSearchHref(scene)}&error=${encodeURIComponent(error)}`);
  redirect(sceneSearchHref(scene));
}
