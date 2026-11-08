"use server";

import {plateActionReturnPath} from "@/lib/plateActions";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  analyzeSceneSearchBrief,
} from "@/lib/sceneKeywords";
import {
  parseRoughShot,
  parseSceneStageChoice,
  parseSceneVehicle,
  preserveNiceToHavePriority,
} from "@/lib/sceneConfiguration";
import {
  EMPTY_SCENE_PRODUCTION_METADATA,
  parseStageUseType,
  sceneProductionMetadataFromForm,
} from "@/lib/sceneProduction";
import { createClient } from "@/lib/supabase/server";
import { sceneSearchHref } from "@/lib/sceneSearch";

function formString(formData: FormData, field: string): string {
  const value = formData.get(field);
  return typeof value === "string" ? value.trim() : "";
}

function formVehicle(formData: FormData) {
  return parseSceneVehicle(formString(formData, "vehicle"));
}

function projectStageUpdate(formData: FormData):
  | {
      production_approach: "listed_led_stage";
      stage_profile_id: string;
      custom_stage_name: null;
    }
  | {
      production_approach: "undecided" | "vfx_no_led_wall";
      stage_profile_id: null;
      custom_stage_name: null;
    }
  | null {
  const choice = formString(formData, "stageChoice");
  if (choice === "undecided" || choice === "vfx_no_led_wall") {
    return {
      production_approach: choice,
      stage_profile_id: null,
      custom_stage_name: null,
    };
  }

  if (
    choice.startsWith("stage:") &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      choice.slice(6),
    )
  ) {
    return {
      production_approach: "listed_led_stage",
      stage_profile_id: choice.slice(6),
      custom_stage_name: null,
    };
  }

  return null;
}

function formError(path: string, message: string): never {
  const [basePath, fragment] = path.split("#", 2);
  const separator = basePath.includes("?") ? "&" : "?";
  redirect(
    `${basePath}${separator}error=${encodeURIComponent(message)}${
      fragment ? `#${fragment}` : ""
    }`,
  );
}

function scenePath(projectId: string, sceneId: string): string {
  return `/projects/${projectId}/scenes/${sceneId}`;
}

async function analyzeScene(description: string): Promise<{
  keywords: string[];
  searchIntentSummary: string;
  productionMetadata: typeof EMPTY_SCENE_PRODUCTION_METADATA;
  status: "not_needed" | "pending" | "ready";
}> {
  if (!description.trim()) {
    return {
      keywords: [],
      searchIntentSummary: "",
      productionMetadata: EMPTY_SCENE_PRODUCTION_METADATA,
      status: "not_needed",
    };
  }

  try {
    const analysis = await analyzeSceneSearchBrief(description);
    return {
      ...analysis,
      status: "ready",
    };
  } catch (error) {
    console.warn(
      `Scene saved with AI keyword analysis pending: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
    );
    return {
      keywords: [],
      searchIntentSummary: "",
      productionMetadata: EMPTY_SCENE_PRODUCTION_METADATA,
      status: "pending",
    };
  }
}

export async function createProject(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?next=/projects/new");

  const organizationName = formString(formData, "organizationName");
  const projectName =
    formString(formData, "workingTitle") ||
    formString(formData, "projectName");
  const firstSceneName = formString(formData, "firstSceneName");
  const searchBrief = "";
  const scriptPages = formString(formData, "scriptPages");
  const intent = formString(formData, "intent");

  if (!projectName || projectName.length > 200 || !firstSceneName || firstSceneName.length > 200 || scriptPages.length > 80) {
    formError(
      "/projects/new",
      "Give the project a name and name the first scene.",
    );
  }

  const sceneAnalysis = { keywords: [], searchIntentSummary: "", productionMetadata: EMPTY_SCENE_PRODUCTION_METADATA, status: "not_needed" as const };
  const { data, error } = await supabase.rpc("start_project", {
    organization_name: organizationName,
    project_name: projectName,
    first_scene_name: firstSceneName,
    search_brief: searchBrief || undefined,
    display_name: formString(formData, "displayName") || undefined,
  });

  const result = data?.[0];
  if (error || !result) {
    formError(
      "/projects/new",
      "The project could not be created. Check the details and try again.",
    );
  }

  const { error: sceneMetadataError } = await supabase
    .from("scenes")
    .update({
      vehicle: formVehicle(formData),
      script_scene_number: null,
      script_pages: scriptPages || null,
      generated_keywords: sceneAnalysis.keywords,
      search_intent_summary: sceneAnalysis.searchIntentSummary || null,
      continuity_group: null,
      stage_use_type: "vehicle_process",
      production_metadata: sceneAnalysis.productionMetadata,
      keyword_generation_status: sceneAnalysis.status,
      keywords_generated_at: sceneAnalysis.keywords.length
        ? new Date().toISOString()
        : null,
    })
    .eq("id", result.scene_id)
    .eq("project_id", result.project_id);
  if (sceneMetadataError) {
    formError(
      scenePath(result.project_id, result.scene_id),
      "The project was created, but its first scene metadata could not be saved.",
    );
  }

  const plateReturn=plateActionReturnPath(formString(formData,"plateReturn"));
  if(plateReturn){
    const url=new URL(plateReturn,"http://localhost");
    url.searchParams.set("scene",result.scene_id);
    redirect(url.pathname+url.search);
  }
  if (intent === "find-plates" || formString(formData, "saveSku")) {
    redirect(sceneSearchHref({ id: result.scene_id, name: firstSceneName, search_brief: searchBrief }, formString(formData, "saveSku") || undefined));
  }
  redirect(`/projects/${result.project_id}?created=1#add-scene`);
}

export type ProjectSaveResult =
  | { ok: true; savedAt: string }
  | { ok: false; error: string; authenticationRequired?: boolean };

async function persistProjectDetails(
  formData: FormData,
): Promise<ProjectSaveResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const projectId = formString(formData, "projectId");
  const path = `/projects/${projectId}`;

  if (!user) {
    return {
      ok: false,
      error: "Your session expired. Sign in again before retrying this save.",
      authenticationRequired: true,
    };
  }

  const workingTitle = formString(formData, "workingTitle");
  if (!projectId || !workingTitle) {
    return {
      ok: false,
      error: "Give the project a name.",
    };
  }

  // Preserve legacy data without exposing a separate client field in the UI.
  const { data: existing, error: existingError } = await supabase.from("projects").select("client_name, actual_title").eq("id", projectId).maybeSingle();
  if (existingError || !existing) {
    return { ok: false, error: "The project details could not be loaded. Please try again." };
  }
  const dueDate = formString(formData, "dueDate");
  const { error } = await supabase.rpc("update_project_details", {
    target_project_id: projectId,
    working_title: workingTitle,
    client_name: existing?.client_name || undefined,
    actual_title: existing.actual_title || undefined,
    project_description:
      formString(formData, "projectDescription") || undefined,
    project_due_date: dueDate || undefined,
  });
  if (error) {
    return {
      ok: false,
      error: "The project details could not be saved. Please try again.",
    };
  }

  const stageUpdate = projectStageUpdate(formData);
  if (stageUpdate) {
    const { error: stageError } = await supabase
      .from("projects")
      .update(stageUpdate)
      .eq("id", projectId);
    if (stageError) {
      return {
        ok: false,
        error: "The project details were saved, but its stage was not.",
      };
    }
  }

  revalidatePath("/projects");
  revalidatePath(path);
  return { ok: true, savedAt: new Date().toISOString() };
}

export async function saveProjectDetails(
  formData: FormData,
): Promise<ProjectSaveResult> {
  return persistProjectDetails(formData);
}

export async function updateProject(formData: FormData) {
  const projectId = formString(formData, "projectId");
  const path = `/projects/${projectId}`;
  const result = await persistProjectDetails(formData);

  if (!result.ok) {
    if (result.authenticationRequired) {
      redirect(`/login?next=${encodeURIComponent(path)}`);
    }
    formError(path, result.error);
  }

  redirect(`${path}?updated=1`);
}

export async function createScene(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const projectId = formString(formData, "projectId");

  if (!user) {
    redirect(
      `/login?next=${encodeURIComponent(`/projects/${projectId}`)}`,
    );
  }

  const sceneName = formString(formData, "sceneName");
  if (!projectId || !sceneName || sceneName.length > 200 || formString(formData, "scriptPages").length > 80) {
    formError(`/projects/${projectId}`, "Give the scene a name.");
  }

  const searchBrief = formString(formData, "searchBrief");
  const sceneAnalysis = { keywords: [], searchIntentSummary: "", productionMetadata: EMPTY_SCENE_PRODUCTION_METADATA, status: "not_needed" as const };
  const { data: sceneId, error } = await supabase.rpc(
    "add_project_scene",
    {
      target_project_id: projectId,
      scene_name: sceneName,
      search_brief: searchBrief || undefined,
      script_scene_number:
        formString(formData, "scriptSceneNumber") || undefined,
      script_pages: formString(formData, "scriptPages") || undefined,
      generated_keywords: sceneAnalysis.keywords,
    },
  );

  if (error || !sceneId) {
    formError(
      `/projects/${projectId}`,
      "The scene could not be added. Please try again.",
    );
  }
  const { error: vehicleError } = await supabase
    .from("scenes")
    .update({
      vehicle: formVehicle(formData),
      search_intent_summary: sceneAnalysis.searchIntentSummary || null,
      production_metadata: sceneAnalysis.productionMetadata,
      keyword_generation_status: sceneAnalysis.status,
      keywords_generated_at: sceneAnalysis.keywords.length
        ? new Date().toISOString()
        : null,
    })
    .eq("id", sceneId)
    .eq("project_id", projectId);
  if (vehicleError) {
    formError(
      scenePath(projectId, sceneId),
      "The scene was created, but its vehicle could not be saved.",
    );
  }

  revalidatePath(`/projects/${projectId}`);
  if (!formString(formData, "saveSku")) redirect(`/projects/${projectId}?added=1#add-scene`);
  redirect(sceneSearchHref({ id: sceneId, name: sceneName, search_brief: searchBrief }, formString(formData, "saveSku") || undefined));
}

export async function updateSceneBrief(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const projectId = formString(formData, "projectId");
  const path = `/projects/${projectId}`;
  if (!user) redirect(`/login?next=${encodeURIComponent(path)}`);
  const name = formString(formData, "sceneName");
  const pages = formString(formData, "scriptPages");
  if (!name || name.length > 200 || pages.length > 80) formError(path, "Enter a scene name and a page number of up to 80 characters.");
  // Update only the visible fields. Existing briefs and production metadata are retained.
  const { data, error } = await supabase.from("scenes")
    .update({ name, script_pages: pages || null, vehicle: formVehicle(formData) })
    .eq("id", formString(formData, "sceneId")).eq("project_id", projectId)
    .is("archived_at", null).select("id").maybeSingle();
  if (error || !data) formError(path, "This scene could not be updated. Check your project access and retry.");
  revalidatePath(path);
}

export async function updateScene(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const projectId = formString(formData, "projectId");
  const sceneId = formString(formData, "sceneId");
  const path = scenePath(projectId, sceneId);

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(path)}`);
  }

  const sceneName = formString(formData, "sceneName");
  const searchBrief = formString(formData, "searchBrief");
  const searchIntentSummary = formString(formData, "searchIntentSummary");
  if (!projectId || !sceneId || !sceneName) {
    formError(path, "Give the scene a title.");
  }
  if (!searchIntentSummary) {
    formError(
      path,
      "Add a one-sentence search summary so collaborators can understand what the scene needs.",
    );
  }
  if (searchIntentSummary.length > 320) {
    formError(path, "Keep the search summary to 320 characters or fewer.");
  }

  const { data: currentPriorities, error: prioritiesError } = await supabase
    .from("scenes")
    .select("nice_to_have_keywords")
    .eq("id", sceneId)
    .eq("project_id", projectId)
    .is("archived_at", null)
    .maybeSingle();
  if (prioritiesError || !currentPriorities) {
    formError(path, "The scene search priorities could not be loaded.");
  }

  const keywordAnalysis = await analyzeScene(searchBrief);
  const prioritizedKeywords = preserveNiceToHavePriority(
    keywordAnalysis.keywords,
    currentPriorities.nice_to_have_keywords,
  );
  const { error } = await supabase.rpc("update_project_scene", {
    target_scene_id: sceneId,
    scene_name: sceneName,
    search_brief: searchBrief || undefined,
    script_scene_number:
      formString(formData, "scriptSceneNumber") || undefined,
    script_pages: formString(formData, "scriptPages") || undefined,
    generated_keywords: prioritizedKeywords.mustHave,
  });
  if (error) {
    formError(path, "The scene could not be updated. Please try again.");
  }
  const sceneStageUpdate = parseSceneStageChoice(
    formString(formData, "stageChoice"),
  );
  const { error: configurationError } = await supabase
    .from("scenes")
    .update({
      vehicle: formVehicle(formData),
      rough_shot: parseRoughShot(formString(formData, "roughShot")),
      search_intent_summary: searchIntentSummary,
      continuity_group:
        formString(formData, "continuityGroup").toLocaleLowerCase() || null,
      stage_use_type: parseStageUseType(
        formString(formData, "stageUseType"),
      ),
      production_metadata: sceneProductionMetadataFromForm(formData),
      nice_to_have_keywords: prioritizedKeywords.niceToHave,
      keyword_generation_status: keywordAnalysis.status,
      keywords_generated_at:
        keywordAnalysis.status === "ready" ? new Date().toISOString() : null,
      ...(sceneStageUpdate ?? {}),
    })
    .eq("id", sceneId)
    .eq("project_id", projectId);
  if (configurationError) {
    formError(
      path,
      "The scene details were saved, but its production configuration was not.",
    );
  }

  revalidatePath(`/projects/${projectId}`);
  revalidatePath(path);
  redirect(`${path}?updated=1`);
}

export async function refreshSceneKeywords(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const projectId = formString(formData, "projectId");
  const sceneId = formString(formData, "sceneId");
  const path = scenePath(projectId, sceneId);

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(path)}`);
  }

  const { data: scene, error: loadError } = await supabase
    .from("scenes")
    .select(
      "name, search_brief, search_intent_summary, script_scene_number, script_pages, nice_to_have_keywords",
    )
    .eq("id", sceneId)
    .eq("project_id", projectId)
    .is("archived_at", null)
    .maybeSingle();
  if (loadError || !scene?.search_brief) {
    formError(path, "Add a scene description before generating keywords.");
  }

  let analysis: Awaited<ReturnType<typeof analyzeSceneSearchBrief>>;
  try {
    analysis = await analyzeSceneSearchBrief(scene.search_brief);
  } catch {
    formError(
      path,
      "OpenAI keyword analysis is still unavailable. Check API credits and try again.",
    );
  }

  const prioritizedKeywords = preserveNiceToHavePriority(
    analysis.keywords,
    scene.nice_to_have_keywords,
  );

  const { error } = await supabase.rpc("update_project_scene", {
    target_scene_id: sceneId,
    scene_name: scene.name,
    search_brief: scene.search_brief,
    script_scene_number: scene.script_scene_number || undefined,
    script_pages: scene.script_pages || undefined,
    generated_keywords: prioritizedKeywords.mustHave,
  });
  if (error) {
    formError(path, "The generated keywords could not be saved.");
  }

  const { error: priorityError } = await supabase
    .from("scenes")
    .update({
      nice_to_have_keywords: prioritizedKeywords.niceToHave,
      ...(scene.search_intent_summary
        ? {}
        : {
            search_intent_summary: analysis.searchIntentSummary,
            production_metadata: analysis.productionMetadata,
          }),
      keyword_generation_status: "ready",
      keywords_generated_at: new Date().toISOString(),
    })
    .eq("id", sceneId)
    .eq("project_id", projectId);
  if (priorityError) {
    formError(path, "The generated keyword priorities could not be saved.");
  }

  revalidatePath(path);
  redirect(`${path}?keywords=1`);
}

export async function moveSceneKeywordPriority(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const projectId = formString(formData, "projectId");
  const sceneId = formString(formData, "sceneId");
  const path = scenePath(projectId, sceneId);

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(path)}`);
  }

  const keyword = formString(formData, "keyword").toLocaleLowerCase();
  const targetPriority = formString(formData, "targetPriority");
  if (
    !projectId ||
    !sceneId ||
    !keyword ||
    !new Set(["must", "nice"]).has(targetPriority)
  ) {
    formError(path, "Choose a valid descriptor and priority.");
  }

  const { data: scene, error: loadError } = await supabase
    .from("scenes")
    .select("generated_keywords, nice_to_have_keywords")
    .eq("id", sceneId)
    .eq("project_id", projectId)
    .is("archived_at", null)
    .maybeSingle();
  if (loadError || !scene) {
    formError(path, "The scene descriptors could not be loaded.");
  }

  const mustHave = new Set(
    scene.generated_keywords.map((value) => value.toLocaleLowerCase()),
  );
  const niceToHave = new Set(
    scene.nice_to_have_keywords.map((value) => value.toLocaleLowerCase()),
  );
  if (!mustHave.has(keyword) && !niceToHave.has(keyword)) {
    formError(path, "That descriptor is no longer part of this scene.");
  }
  mustHave.delete(keyword);
  niceToHave.delete(keyword);
  if (targetPriority === "must") mustHave.add(keyword);
  if (targetPriority === "nice") niceToHave.add(keyword);

  const { error } = await supabase
    .from("scenes")
    .update({
      generated_keywords: [...mustHave],
      nice_to_have_keywords: [...niceToHave],
    })
    .eq("id", sceneId)
    .eq("project_id", projectId);
  if (error) {
    formError(path, "The descriptor priority could not be changed.");
  }

  revalidatePath(path);
  redirect(`${path}?priorities=1`);
}

export async function archiveScene(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const projectId = formString(formData, "projectId");
  const sceneId = formString(formData, "sceneId");
  const path = scenePath(projectId, sceneId);

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(path)}`);
  }
  if (!projectId || !sceneId) {
    formError(`/projects/${projectId}`, "Choose a valid scene.");
  }

  const { data: archivedProjectId, error } = await supabase.rpc(
    "archive_project_scene",
    { target_scene_id: sceneId },
  );
  if (error || archivedProjectId !== projectId) {
    formError(path, "The scene could not be deleted. Please try again.");
  }

  revalidatePath(`/projects/${projectId}`);
  redirect(`/projects/${projectId}?deleted=1`);
}

export async function addClipToScene(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const projectId = formString(formData, "projectId");
  const sceneId = formString(formData, "sceneId");
  const stockClipId = formString(formData, "stockClipId");

  if (!user) {
    redirect(
      `/login?next=${encodeURIComponent(
        `/projects/${projectId}/scenes/${sceneId}`,
      )}`,
    );
  }
  if (!sceneId || !stockClipId) {
    formError(
      scenePath(projectId, sceneId),
      "Choose a valid catalog clip.",
    );
  }

  const { error } = await supabase.rpc("add_clip_to_scene", {
    target_scene_id: sceneId,
    target_stock_clip_id: stockClipId,
  });
  if (error) {
    formError(
      scenePath(projectId, sceneId),
      "The clip could not be added to this scene.",
    );
  }
  revalidatePath(scenePath(projectId, sceneId));
}


export async function saveProjectSceneGrid(input: {
  projectId: string | null; name: string; version?: number; rows: unknown;
  organizationName?: string; displayName?: string;
}): Promise<{ok: true; projectId: string; version: number; rows: {key:string;id:string}[]} | {ok:false;error:string}> {
  const { parseProjectSceneGrid } = await import('@/lib/projectSceneGrid');
  let rows;
  try { rows = parseProjectSceneGrid(input.rows); }
  catch (error) { return {ok:false,error:error instanceof Error ? error.message : 'Check the scene fields.'}; }
  if (!input.name?.trim() || input.name.trim().length > 200) return {ok:false,error:'Enter a project name of up to 200 characters.'};
  const supabase = await createClient();
  const {data:{user}} = await supabase.auth.getUser();
  if (!user) return {ok:false,error:'Your session expired. Sign in before saving.'};
  const {data,error} = await supabase.rpc('save_project_scene_grid', {
    target_project_id: input.projectId, project_name: input.name.trim(), scene_rows: rows,
    expected_version: input.version, organization_name: input.organizationName, display_name: input.displayName,
  });
  if (error) return {ok:false,error:error.code==='40001' ? 'This project changed in another session. Reload before saving.' : 'The project could not be saved. Your edits are still here; please retry.'};
  const saved=data as {projectId:string;version:number;rows:{key:string;id:string}[]};
  revalidatePath('/projects'); revalidatePath(`/projects/${saved.projectId}`);
  return {ok:true,...saved};
}
