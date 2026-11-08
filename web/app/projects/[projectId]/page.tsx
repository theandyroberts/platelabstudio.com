import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ProjectDetailsAutosave } from "@/components/ProjectDetailsAutosave";
import { SceneGrid } from "@/components/SceneGrid";
import { createClient } from "@/lib/supabase/server";

type ProjectPageProps = {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{
    added?: string;
    created?: string;
    deleted?: string;
    error?: string;
    updated?: string;
    save?: string;
  }>;
};

export const dynamic = "force-dynamic";

export default async function ProjectPage({
  params,
  searchParams,
}: ProjectPageProps) {
  const { projectId } = await params;
  const query = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/projects/${projectId}`)}`);
  }

  const [{ data: project }, { data: scenes }, { data: stages }] =
    await Promise.all([
      supabase
        .from("projects")
        .select(
          "id, name, version, description, due_date, production_approach, stage_profile_id, custom_stage_name",
        )
        .eq("id", projectId)
        .maybeSingle(),
      supabase
        .from("scenes")
        .select(
          "id, scene_number, name, search_brief, vehicle, script_scene_number, script_pages, generated_keywords, keyword_generation_status, scene_clips(status)",
        )
        .eq("project_id", projectId)
        .is("archived_at", null)
        .order("sort_order")
        .order("scene_number"),
      supabase
        .from("stage_profiles")
        .select("id, name")
        .eq("active", true)
        .order("name"),
    ]);

  if (!project) notFound();

  const stageProfile = stages?.find(
    (stage) => stage.id === project.stage_profile_id,
  );
  const stageLabel =
    project.production_approach === "listed_led_stage"
      ? stageProfile?.name || "Listed LED stage"
      : project.production_approach === "custom_led_stage"
        ? project.custom_stage_name || "Custom LED stage"
        : project.production_approach === "vfx_no_led_wall"
          ? "VFX / no LED wall"
          : "Stage undecided";
  const stageChoice =
    project.production_approach === "listed_led_stage" &&
    project.stage_profile_id
      ? `stage:${project.stage_profile_id}`
      : project.production_approach === "custom_led_stage"
        ? "keep_custom"
        : project.production_approach;

  return (
    <main className="workspace-shell project-workspace">
      <Link href="/projects" className="mono dim back-link">
        ← Projects
      </Link>

      <header className="workspace-intro project-heading">
        <div>
          <h1>Project</h1>
        </div>
        <div className="project-heading-tools">
          <span className="status-chip mono">
            {stageLabel}
          </span>
          <details className="project-details-editor">
            <summary className="secondary-button">Edit project</summary>
            <div className="project-details-panel">
              <div>
                <p className="mono accent">Project details</p>
                <h2>Edit project</h2>
              </div>
              <ProjectDetailsAutosave
                project={{
                  id: project.id,
                  name: project.name,
                  dueDate: project.due_date ?? "",
                  description: project.description ?? "",
                }}
                stages={stages ?? []}
                stageChoice={stageChoice}
                customStageName={project.custom_stage_name ?? undefined}
              />
            </div>
          </details>
        </div>
      </header>

      {query.error && <p className="auth-alert error">{query.error}</p>}
      {query.created === "1" && (
        <p className="auth-alert success">
          Project created. Keep adding scenes below, or open any saved scene
          when you are ready to choose clips.
        </p>
      )}
      {query.added === "1" && (
        <p className="auth-alert success">
          Scene saved. Add the next scene while the shot list is in front of
          you.
        </p>
      )}
      {query.deleted === "1" && (
        <p className="auth-alert success">
          Scene deleted from this project.
        </p>
      )}
      {query.updated === "1" && (
        <p className="auth-alert success">Project details updated.</p>
      )}

      <SceneGrid projectId={project.id} projectName={project.name} version={project.version} scenes={scenes ?? []} saveSku={query.save} />
    </main>
  );
}
