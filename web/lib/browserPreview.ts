import clipIds from './browser-preview-clips.json';

const available = new Set(clipIds);

/** Presentation-only derivatives. Approved snapshots and delivery metadata stay intact. */
export function browserPreviewUrl(source: string): string {
  const match = source.match(/^(\/composite-review\/media\/composite\/)([a-z0-9-]+)\/composite\.mp4([?#].*)?$/);
  if (!match || !available.has(match[2])) return source;
  return `${match[1]}${match[2]}/browser-preview-v1.mp4${match[3] || ''}`;
}
