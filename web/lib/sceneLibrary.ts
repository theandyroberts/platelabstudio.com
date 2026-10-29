import type { Database } from "@platelab/shared";
import { plateSchema } from "@platelab/shared";
import type { SupabaseClient } from "@supabase/supabase-js";

const reply = (body: unknown, status = 200) => ({ body, status });

export async function readSceneLibrary(supabase: SupabaseClient<Database>, sceneId: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return reply({ authenticated: false, scenes: [], clips: [] });

  // The session client applies project membership / scene RLS to every read.
  const { data: rows, error } = await supabase.from("scenes")
    .select("id, project_id, name, search_brief, projects(name)")
    .is("archived_at", null).order("created_at", { ascending: false });
  if (error) return reply({ error: "Your scenes could not be loaded. Please retry." }, 503);
  const scenes = (rows ?? []).flatMap(row => {
    const project = Array.isArray(row.projects) ? row.projects[0] : row.projects;
    return project ? [{ id: row.id, projectId: row.project_id, projectName: project.name, name: row.name, brief: row.search_brief || "" }] : [];
  });
  if (!sceneId) return reply({ authenticated: true, scenes, clips: [] });
  if (!scenes.some(scene => scene.id === sceneId)) return reply({ error: "This scene is unavailable or you no longer have access." }, 404);

  const { data: clips, error: clipError } = await supabase.from("scene_clips")
    .select("id, status, version, in_frame, out_frame, stock_clips(source_metadata)")
    .eq("scene_id", sceneId).order("created_at");
  if (clipError) return reply({ error: "Saved clips could not be loaded. Please retry." }, 503);
  const parsed = (clips ?? []).flatMap(row => {
    const stock = Array.isArray(row.stock_clips) ? row.stock_clips[0] : row.stock_clips;
    const result = plateSchema.safeParse(stock?.source_metadata);
    return result.success ? [{ id: row.id, status: row.status, version: row.version, inFrame: row.in_frame, outFrame: row.out_frame, plate: result.data }] : [];
  });
  if (parsed.length !== (clips ?? []).length) return reply({ error: "Some saved clip details are unavailable. Please retry." }, 503);
  return reply({ authenticated: true, scenes, clips: parsed });
}

export async function saveSceneLibraryClip(supabase: SupabaseClient<Database>, input: { sceneId: string; sku: string }) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return reply({ error: "Sign in to save clips." }, 401);
  const { data: scene } = await supabase.from("scenes").select("id")
    .eq("id", input.sceneId).is("archived_at", null).maybeSingle();
  if (!scene) return reply({ error: "This scene is unavailable." }, 404);
  const { data: clip } = await supabase.from("stock_clips").select("id")
    .eq("sku", input.sku).eq("status", "live").maybeSingle();
  if (!clip) return reply({ error: "This clip is no longer available." }, 404);
  // Existing RPC enforces edit permissions, availability, deduplication and audit logging.
  const { data: id, error } = await supabase.rpc("add_clip_to_scene", {
    target_scene_id: input.sceneId, target_stock_clip_id: clip.id,
  });
  if (error) return reply({ error: "The clip could not be saved. Check your project access and try again." }, 403);
  return reply({ id });
}
