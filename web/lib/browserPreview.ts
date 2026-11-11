import clipIds from './browser-preview-clips.json';

const available = new Set(clipIds);
const COMPOSITE = /^(\/composite-review\/media\/composite\/)([a-z0-9-]+)\/(?:composite|browser-preview-v1)\.mp4([?#].*)?$/;

/** Adaptive first, with the single progressive file every browser can play. */
export type VideoSources = { adaptive?: string; progressive: string };

// Smallest rung of each ladder, as named by scripts/build-browser-previews.py.
const SMALLEST_HERO_RUNG = '360p';
const SMALLEST_COMPOSITE_RUNG = '384p';

/**
 * The few small files every adaptive start needs before its first segment:
 * the ladder, the smallest rung's playlist and its header. Requested with the
 * page, they are already in hand when the player starts.
 */
function startupFiles(adaptive: string, smallestRung: string): string[] {
  const directory = adaptive.split('?')[0].replace(/[^/]+$/, '');
  return [adaptive, `${directory}${smallestRung}/index.m3u8`, `${directory}${smallestRung}/init_0.mp4`];
}

export function compositeStartupFiles(sources: VideoSources): string[] {
  return sources.adaptive ? startupFiles(sources.adaptive, SMALLEST_COMPOSITE_RUNG) : [];
}

export function heroStartupFiles(sources: VideoSources): string[] {
  return sources.adaptive ? startupFiles(sources.adaptive, SMALLEST_HERO_RUNG) : [];
}

/** Operations switch: set NEXT_PUBLIC_ADAPTIVE_STREAMING=0 to serve progressive files only. */
const adaptiveEnabled = () => process.env.NEXT_PUBLIC_ADAPTIVE_STREAMING !== '0';

function provisioned(source: string) {
  const match = source.match(COMPOSITE);
  return match && available.has(match[2]) ? { directory: `${match[1]}${match[2]}/`, suffix: match[3] || '' } : null;
}

/** Presentation-only derivatives. Approved snapshots and delivery metadata stay intact. */
export function browserPreviewUrl(source: string): string {
  const clip = provisioned(source);
  return clip ? `${clip.directory}browser-preview-v1.mp4${clip.suffix}` : source;
}

/** The bitrate ladder built beside the progressive preview, for provisioned clips. */
export function adaptiveStreamUrl(source: string): string | undefined {
  const clip = provisioned(source);
  if (!clip || !adaptiveEnabled()) return undefined;
  return `${clip.directory}stream-v1/master.m3u8${clip.suffix.split('#')[0]}`;
}

export function videoSources(source: string): VideoSources {
  return { adaptive: adaptiveStreamUrl(source), progressive: browserPreviewUrl(source) };
}

/** Small hover preview for catalog cards; other sources are returned unchanged. */
export function cardPreviewUrl(source: string): string {
  const clip = provisioned(source);
  return clip ? `${clip.directory}card-preview-v1.mp4${clip.suffix}` : source;
}

export function heroSources(): VideoSources {
  return {
    adaptive: adaptiveEnabled() ? '/media/site/mustang-study14-reflections-stream-v1/master.m3u8' : undefined,
    progressive: '/media/site/mustang-study14-reflections-browser-v1.mp4',
  };
}
