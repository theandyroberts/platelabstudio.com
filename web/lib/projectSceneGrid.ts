import { VEHICLE_OPTIONS, type SceneVehicle } from './sceneConfiguration';
export type GridSceneInput = { key: string; id: string | null; name: string; vehicle: SceneVehicle; pages: string };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function parseProjectSceneGrid(input: unknown): GridSceneInput[] {
  if (!Array.isArray(input) || input.length > 500) throw new Error('Invalid scene grid.');
  const keys = new Set<string>(), ids = new Set<string>();
  return input.map(row => {
    if (!row || typeof row !== 'object' || typeof row.key !== 'string' || !row.key || keys.has(row.key)
      || (row.id !== null && (typeof row.id !== 'string' || !uuid.test(row.id) || ids.has(row.id)))
      || typeof row.name !== 'string' || !row.name.trim() || row.name.trim().length > 200
      || !VEHICLE_OPTIONS.some(option => option.value === row.vehicle)
      || typeof row.pages !== 'string' || row.pages.length > 80) {
      throw new Error('Each scene needs a name and vehicle; Page # is optional.');
    }
    keys.add(row.key); if (row.id) ids.add(row.id);
    return { key: row.key, id: row.id, name: row.name.trim(), vehicle: row.vehicle, pages: row.pages.trim() };
  });
}
export function moveSceneRow<T>(rows: T[], index: number, direction: -1 | 1): T[] {
  const destination = index + direction;
  if (index < 0 || index >= rows.length || destination < 0 || destination >= rows.length) return rows;
  const next = [...rows]; [next[index], next[destination]] = [next[destination], next[index]];
  return next;
}
