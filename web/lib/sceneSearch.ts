import type { Plate } from "@platelab/shared";
import type { SceneClipStatus } from "./sceneClipWorkspace";

export const SCENE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type SearchScene = {
  id: string;
  projectId: string;
  projectName: string;
  name: string;
  brief: string;
};

export type SavedSearchClip = {
  id: string;
  status: SceneClipStatus;
  version: number;
  inFrame: number | null;
  outFrame: number | null;
  plate: Plate;
};

// A scene seeds the universal search; generated metadata never silently changes it.
export function sceneSearchHref(scene: { id: string; name: string; search_brief?: string | null }, saveSku?: string) {
  const params = new URLSearchParams({ scene: scene.id, q: scene.search_brief?.trim() || scene.name });
  if (saveSku) params.set("save", saveSku);
  return `/browse?${params}`;
}

export function parseSceneClipSave(value: unknown): { sceneId: string; sku: string } | null {
  if (!value || typeof value !== "object") return null;
  const { sceneId, sku } = value as Record<string, unknown>;
  if (typeof sceneId !== "string" || !SCENE_ID_PATTERN.test(sceneId) ||
      typeof sku !== "string" || !/^PL-[A-Z0-9-]{1,80}$/i.test(sku)) return null;
  return { sceneId, sku };
}

export function sceneBrowseParams(params: URLSearchParams, sceneId: string, saveSku?: string | null) {
  const next = new URLSearchParams(params);
  if (sceneId) next.set("scene", sceneId);
  else next.delete("scene");
  if (saveSku) next.set("save", saveSku);
  else next.delete("save");
  return next;
}
