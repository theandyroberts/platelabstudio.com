import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ProjectDetailsAutosave } from "@/components/ProjectDetailsAutosave";
import { SceneDeleteForm } from "@/components/SceneDeleteForm";
import { SceneInputWorkspace } from "@/components/SceneInputWorkspace";
import { sceneClipCounts } from "@/lib/sceneClipCounts";
import { createClient } from "@/lib/supabase/server";
import { createScene, updateSceneBrief } from "../actions";
import { sceneSearchHref } from "@/lib/sceneSearch";

type ProjectPageProps = {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{
    added?: string;
    created?: string;
    deleted?: string;
    error?: string;
    imported?: string;
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
          "id, name, actual_title, client_name, description, due_date, production_approach, stage_profile_id, custom_stage_name",
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
          <h1>{project.name}</h1>
          <p className="dim">
            {project.client_name || "No client specified"}
          </p>
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
                  actualTitle: project.actual_title ?? "",
                  clientName: project.client_name ?? "",
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
      {query.imported && (
        <p className="auth-alert success">
          Imported {query.imported} approved scene
          {query.imported === "1" ? "" : "s"} from JSON.
        </p>
      )}
      {query.updated === "1" && (
        <p className="auth-alert success">Project details updated.</p>
      )}

      <SceneInputWorkspace
        sceneCount={scenes?.length ?? 0}
        sceneTable={
          <div className="scene-table-wrap">
            <table className="scene-table simple-scene-table">
              <thead>
                <tr>
                  <th scope="col">Scene #</th>
                  <th scope="col">Scene</th>
                  <th scope="col">Footage description</th>
                  <th scope="col">Saved</th>
                  <th scope="col">In quote</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {scenes?.map((scene) => {
                  const href = sceneSearchHref(scene);
                  const clipCounts = sceneClipCounts(scene.scene_clips);
                  return (
                    <tr key={scene.id}>
                      <td className="scene-script mono-md">
                        {scene.script_scene_number || String(scene.scene_number).padStart(2, "0")}
                      </td>
                      <td className="scene-name-cell">
                        <Link href={href}>{scene.name}</Link>
                      </td>
                      <td className="scene-brief">
                        <Link href={href}>
                          {scene.search_brief || scene.name}
                        </Link>
                      </td>
                      <td className="scene-clip-count mono-md">
                        {clipCounts.considering + clipCounts.selected}
                      </td>
                      <td className="scene-clip-count is-selected mono-md">
                        {clipCounts.selected}
                      </td>
                      <td className="scene-open-cell">
                        <Link href={href}>Search</Link>
                        <Link href={`/browse?scene=${scene.id}&saved=1`}>Saved clips</Link>
                        <details className="simple-scene-edit">
                          <summary>Edit</summary>
                          <form action={updateSceneBrief} className="workspace-form compact-form">
                            <input type="hidden" name="projectId" value={project.id} />
                            <input type="hidden" name="sceneId" value={scene.id} />
                            <label><span>Scene name</span><input name="sceneName" defaultValue={scene.name} maxLength={200} required /></label>
                            <label><span>Footage description</span><textarea name="searchBrief" defaultValue={scene.search_brief || ""} maxLength={10000} rows={3} /></label>
                            <button className="primary-button" type="submit">Save scene</button>
                          </form>
                          <SceneDeleteForm projectId={project.id} sceneId={scene.id} sceneName={scene.name} />
                        </details>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        }
        addScenePanel={
          <aside className="add-scene-card" id="add-scene">
            <h2>Add scene</h2>
            <form action={createScene} className="workspace-form compact-form">
              <input type="hidden" name="projectId" value={project.id} />
              {query.save && <input type="hidden" name="saveSku" value={query.save} />}
              <label>
                <span>Scene title</span>
                <input
                  name="sceneName"
                  type="text"
                  placeholder="Ransom’s getaway"
                  maxLength={200}
                  required
                />
              </label>
              <div className="form-grid compact-metadata-grid">
                <label>
                  <span>Script scene <em>optional</em></span>
                  <input
                    name="scriptSceneNumber"
                    type="text"
                    placeholder="41"
                    maxLength={40}
                  />
                </label>
              </div>
              <label>
                <span>What footage do you need?</span>
                <textarea
                  name="searchBrief"
                  placeholder="Open coast, clear horizon, late afternoon…"
                  rows={4}
                />
              </label>
              <div className="stacked-form-actions">
                <button
                  type="submit"
                  name="intent"
                  value="find-plates"
                  className="primary-button"
                >
                  Save and search
                </button>
                <button
                  type="submit"
                  name="intent"
                  value="add-another"
                  className="secondary-button"
                >
                  Save and add another
                </button>
              </div>
            </form>
          </aside>
        }
      />
    </main>
  );
}
