import { SCENE_ID_PATTERN } from './sceneSearch';
const uuid = (value: unknown): value is string => typeof value === 'string' && SCENE_ID_PATTERN.test(value);
export function parseOrderAddition(value: unknown) {
  if (!value || typeof value !== 'object') return null;
  const { projectId, sceneId } = value as Record<string, unknown>;
  if (!uuid(projectId) || (sceneId !== undefined && !uuid(sceneId))) return null;
  return { projectId, sceneId: sceneId as string | undefined };
}
export function parseOrderUpdate(value: unknown) {
  if (!value || typeof value !== 'object') return null;
  const { sceneClipId, inOrder, expectedVersion } = value as Record<string, unknown>;
  if (!uuid(sceneClipId) || typeof inOrder !== 'boolean' || typeof expectedVersion !== 'number' || !Number.isSafeInteger(expectedVersion) || expectedVersion < 1) return null;
  return { sceneClipId, inOrder, expectedVersion };
}
