import { getPlate } from '@/lib/catalog';
import { loadImportedComposite } from '@/lib/importedComposite';
import { buildWheelTravel } from '../../../../../../viewer/src/wheel-motion.js';

/** Public catalog telemetry, sampled in the same media-time coordinates as the map. */
export async function GET(_request: Request, { params }: { params: Promise<{ sku: string }> }) {
  const { sku } = await params;
  if (!/^PL-\d+$/.test(sku)) return Response.json({ intervals: [] }, { status: 400 });
  const plate = await getPlate(sku);
  if (!plate) return Response.json({ intervals: [] }, { status: 404 });
  const clip = plate.composite ? await loadImportedComposite(plate) : undefined;
  const intervals = clip?.telemetry !== 'pending' ? buildWheelTravel(clip?.map.segments ?? []) : [];
  return Response.json({ intervals }, { headers: { 'Cache-Control': 'private, max-age=300' } });
}
