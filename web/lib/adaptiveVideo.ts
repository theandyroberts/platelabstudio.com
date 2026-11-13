import { useEffect, useRef, type RefObject } from 'react';
// Bundled with the pages that play footage, so it downloads alongside them
// rather than in a second round after they have started.
import Hls from 'hls.js/light';
import type { ErrorData, HlsConfig, Loader, LoaderCallbacks, LoaderConfiguration, LoaderContext } from 'hls.js';
import type { VideoSources } from './browserPreview';

/**
 * One way to put footage on a <video>, for every player on the site.
 *
 * Preference order:
 *   1. Adaptive ladder through Media Source Extensions: the rung follows the
 *      measured connection, so playback starts small and never outruns the link.
 *   2. The browser's own HLS player (older iPhones, which have no MSE).
 *   3. The single progressive file.
 * Any failure of 1 or 2 falls through to 3, so a clip whose ladder has not been
 * provisioned yet still plays exactly as it did before.
 *
 * A source can be replaced (fallback) after a player asked for playback, and
 * play() on an element that is changing source is aborted. Players therefore
 * keep their own "should be playing" intent and start from onSourceAttached.
 */

export type AdaptiveMode = 'adaptive' | 'native' | 'progressive';
export type AdaptiveVideoOptions = {
  /** Never fetch a rung larger than the element is drawn. Leave off when the
   *  frames also feed a texture (Lab 360) that outlives the element's layout. */
  capToPlayerSize?: boolean;
  /** A source now exists (first attach, or after falling back): safe to play(). */
  onSourceAttached?: () => void;
};
export type AdaptiveVideo = {
  readonly mode: AdaptiveMode;
  /** Recover after an error without discarding the adaptive session. */
  retry(): void;
  /** A large download of the page's own that shared the link has ended (the
   *  Lab 360 bundle, say): throughput measured meanwhile understates it. */
  linkFreed(): void;
  destroy(): void;
};

const NATIVE_HLS = 'application/vnd.apple.mpegurl';
const ESTIMATE_KEY = 'tpl:throughput';
const ESTIMATE_TTL_MS = 10 * 60 * 1000;
// Budget for the first two seconds of footage. A rung is only chosen for
// start-up when the connection can deliver its first segment within this.
const START_BUDGET_SECONDS = 2;
const CAUTIOUS_ESTIMATE_BPS = 1_000_000;
// Enough footage ahead to ride out a dip, little enough that a better rung
// reaches the screen within seconds of the connection allowing it.
const FORWARD_BUFFER_SECONDS = 12;

/**
 * Field diagnostics. In the browser console run
 *   localStorage.setItem('tpl:video-debug', '1')
 * and reload: every rung choice, segment and fallback is logged with "[tpl]".
 */
function debugLog(): (...parts: unknown[]) => void {
  try { if (localStorage.getItem('tpl:video-debug') === '1') return (...parts) => console.log('[tpl]', ...parts); } catch { /* Storage blocked. */ }
  return () => {};
}

type Connection = { downlink?: number; effectiveType?: string; saveData?: boolean };
const connection = () => (typeof navigator === 'undefined' ? undefined : (navigator as Navigator & { connection?: Connection }).connection);

/** The browser's own hint (Chromium only). Good enough to skip the smallest rung, never more. */
function connectionLooksFast() {
  const hint = connection();
  return Boolean(hint && !hint.saveData && hint.effectiveType === '4g' && (hint.downlink ?? 0) >= 5);
}

function savesData() {
  return Boolean(connection()?.saveData);
}

/** Visitors who asked their browser for less data or less motion get a poster and a play button. */
export function prefersNoAutoplay() {
  if (typeof window === 'undefined') return false;
  return savesData() || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** True once a source is attached and play() can be called. */
export function hasSource(video: HTMLVideoElement) {
  return video.networkState !== HTMLMediaElement.NETWORK_EMPTY;
}

/** Seconds of footage already downloaded ahead of the playhead. */
export function bufferedAhead(video: HTMLVideoElement) {
  const { buffered, currentTime } = video;
  for (let i = 0; i < buffered.length; i += 1) {
    if (buffered.start(i) <= currentTime + 0.25 && buffered.end(i) > currentTime) return buffered.end(i) - currentTime;
  }
  return 0;
}

/** Throughput measured by an earlier player in this visit, in bits per second. */
function rememberedThroughput(): number | undefined {
  try {
    const saved = JSON.parse(sessionStorage.getItem(ESTIMATE_KEY) || 'null');
    if (saved && Date.now() - saved.at < ESTIMATE_TTL_MS && saved.bps > 0) return saved.bps;
  } catch { /* Private browsing or blocked storage: measure again. */ }
  return undefined;
}

/**
 * What the page's own files just showed about this connection. Files of some
 * size, fetched from the network (not a cache), each give a floor for its
 * speed; files that shared the link understate it, which errs on the safe side.
 */
function observedThroughput(): number | undefined {
  if (typeof performance === 'undefined' || !performance.getEntriesByType) return undefined;
  let best = 0;
  for (const entry of performance.getEntriesByType('resource') as PerformanceResourceTiming[]) {
    const seconds = (entry.responseEnd - entry.responseStart) / 1000;
    if (entry.transferSize >= 50_000 && seconds > 0) best = Math.max(best, (entry.transferSize * 8) / seconds);
  }
  return best ? Math.min(best * 0.8, 50_000_000) : undefined;
}

let timingBufferRaised = false;
/** Segments are many; keep the browser's record of them from filling up. */
function keepSegmentTimings() {
  if (timingBufferRaised || typeof performance === 'undefined' || !performance.setResourceTimingBufferSize) return;
  timingBufferRaised = true;
  performance.setResourceTimingBufferSize(2000);
}

/** A response served from the browser's cache says nothing about the connection. */
function servedFromCache(url: string, bytes: number, milliseconds: number) {
  const entry = performance.getEntriesByName(url).pop() as PerformanceResourceTiming | undefined;
  if (entry && entry.transferSize === 0 && entry.decodedBodySize > 0) return true;
  // No network delivers a whole segment in a few milliseconds.
  return bytes > 20_000 && milliseconds < 5;
}

/**
 * Segment loader that keeps cached segments out of the throughput estimate.
 * The engine times every segment to judge the connection; one read from the
 * cache would look like a very fast link and select a rung the real link
 * cannot carry. Such a segment is reported as taking what the measured
 * connection would have needed, which leaves the estimate where it was.
 */
function cacheAwareLoader(connectionEstimate: () => number, cached: Set<string>, log: (...parts: unknown[]) => void): HlsConfig['fLoader'] {
  const Base = Hls.DefaultConfig.loader as new (config: HlsConfig) => Loader<LoaderContext>;
  return class extends Base {
    load(context: LoaderContext, config: LoaderConfiguration, callbacks: LoaderCallbacks<LoaderContext>) {
      super.load(context, config, {
        ...callbacks,
        onSuccess: (response, stats, loaded, details) => {
          if (servedFromCache(loaded.url, stats.loaded, stats.loading.end - stats.loading.start)) {
            cached.add(loaded.url);
            log('cached', loaded.url.split('/').slice(-2).join('/'));
            stats.loading.start = stats.loading.end - (stats.loaded * 8000) / connectionEstimate();
            stats.loading.first = stats.loading.start;
          }
          callbacks.onSuccess(response, stats, loaded, details);
        },
      });
    }
  } as HlsConfig['fLoader'];
}

function rememberThroughput(bps: number) {
  if (!Number.isFinite(bps) || bps <= 0) return;
  try { sessionStorage.setItem(ESTIMATE_KEY, JSON.stringify({ bps: Math.round(bps), at: Date.now() })); } catch { /* Optional. */ }
}

export function attachAdaptiveVideo(video: HTMLVideoElement, sources: VideoSources, options: AdaptiveVideoOptions = {}): AdaptiveVideo {
  let mode: AdaptiveMode = 'progressive';
  let hls: Hls | null = null;
  let destroyed = false;
  let relearn = () => {};
  let recoveredDecode = false;
  let networkRetries = 0;
  let lastSaved = 0;
  const detach: (() => void)[] = [];

  const log = debugLog();
  const attached = () => { if (!destroyed) options.onSourceAttached?.(); };
  // Visitors who asked for less data get a first frame, not half a minute of footage.
  const frugal = savesData();

  const useProgressive = () => {
    if (destroyed) return;
    hls?.destroy();
    hls = null;
    video.removeEventListener('error', nativeFailed);
    mode = 'progressive';
    video.dataset.playback = mode;
    log('progressive', sources.progressive);
    // Server-rendered markup may already carry this source and be loading it.
    if (video.getAttribute('src') === sources.progressive && !video.error) { attached(); return; }
    if (frugal) video.preload = 'metadata';
    video.src = sources.progressive;
    video.load();
    attached();
  };
  // Deferred so every listener of this error event still sees the native mode.
  function nativeFailed() { if (mode === 'native') setTimeout(() => { if (mode === 'native') useProgressive(); }, 0); }

  const useAdaptive = () => {
    // What is already known about this connection: an earlier player in this
    // visit, else the page's own downloads a moment ago.
    const prior = rememberedThroughput() ?? observedThroughput();
    keepSegmentTimings();
    let networkEstimate = prior ?? CAUTIOUS_ESTIMATE_BPS;
    // True once a segment has actually crossed the network in this session.
    let measured = false;
    const cachedSegments = new Set<string>();
    const config: Partial<HlsConfig> = {
      fLoader: cacheAwareLoader(() => networkEstimate, cachedSegments, log),
      // First segment: the largest rung this connection delivers within the
      // start budget; with nothing known, a small one, so footage appears
      // quickly anywhere. Every later segment follows measured throughput.
      abrEwmaDefaultEstimate: networkEstimate,
      startLevel: prior ? -1 : connectionLooksFast() ? 1 : 0,
      // No throwaway probe download: the first real segment is the probe.
      testBandwidth: false,
      maxLoadingDelay: START_BUDGET_SECONDS,
      capLevelToPlayerSize: Boolean(options.capToPlayerSize),
      // Step down when the device, not the network, is what cannot keep up.
      // Only meaningful while the element itself is what the visitor watches.
      capLevelOnFPSDrop: Boolean(options.capToPlayerSize),
      // Clips are short and loop: keep what has played so a loop costs no network.
      backBufferLength: Infinity,
      maxBufferLength: frugal ? 6 : FORWARD_BUFFER_SECONDS,
      // A hard ceiling too: without it a fast connection takes the whole clip
      // at once, whether or not anyone stays to watch it.
      maxMaxBufferLength: frugal ? 6 : FORWARD_BUFFER_SECONDS,
    };
    const player = new Hls(config);
    hls = player;
    mode = 'adaptive';
    video.dataset.playback = mode;

    // Looping footage starts on a small rung so it can start at once, and that
    // small opening would replay on every loop. When the rest of the clip is
    // downloaded and the connection is idle, fetch the opening again at the
    // rung in use and drop the small copy, so the next loop opens sharp.
    // The estimator's memory is long: after sharing the link it would hold the
    // rung down for most of a minute. Start it again instead; the very next
    // segment measures the link as it now is.
    relearn = () => { if (hls === player) player.bandwidthEstimate = networkEstimate; };
    const bufferedLevel = new Map<number, number>();
    let upgrading = false;
    // The refetched opening, until the next loop has loaded it back.
    let opening: { level: number; count: number } | null = null;
    // Ask for one rung for the next segment only. The engine ignores a request
    // equal to its own last choice, so that choice is cleared first.
    const loadNextAt = (level: number) => { player.nextAutoLevel = 0; player.nextLoadLevel = level; };
    const upgradeOpening = async () => {
      if (upgrading || !video.loop || frugal || hls !== player) return;
      const target = player.loadLevel;
      const fragments = player.levels[target]?.details?.fragments;
      if (!fragments?.length) return;
      let count = 0;
      while (count < fragments.length && (bufferedLevel.get(fragments[count].sn as number) ?? target) < target) count += 1;
      if (!count) return;
      const end = fragments[count - 1].start + fragments[count - 1].duration;
      const remaining = video.duration - video.currentTime;
      // Idle connection: everything up to the end of the clip is in hand.
      if (!(remaining > 0) || bufferedAhead(video) < remaining - 0.5 || video.currentTime < end + 4) return;
      upgrading = true;
      try {
        for (const fragment of fragments.slice(0, count)) {
          const response = await fetch(fragment.url);
          if (!response.ok) return;
          await response.arrayBuffer();
        }
        if (hls !== player || video.currentTime < end + 2) return;
        for (const fragment of fragments.slice(0, count)) bufferedLevel.delete(fragment.sn as number);
        log('opening upgraded', `${count} segments to rung ${target}`);
        player.trigger(Hls.Events.BUFFER_FLUSHING, { startOffset: 0, endOffset: end, type: null });
        // With nothing buffered at the loop point the engine would play safe
        // and pick a smaller rung; these segments are already in the cache.
        opening = { level: target, count };
        loadNextAt(target);
      } catch { /* The small opening simply stays. */ } finally { upgrading = false; }
    };
    // The engine samples throughput as each segment is buffered; this runs after it.
    player.on(Hls.Events.FRAG_BUFFERED, (_event, data) => {
      if (typeof data.frag.sn === 'number') bufferedLevel.set(data.frag.sn, data.frag.level);
      if (opening && typeof data.frag.sn === 'number') {
        if (data.frag.level === opening.level && data.frag.sn + 1 < opening.count) loadNextAt(opening.level);
        else opening = null;
      }
      // Only segments that crossed the network say anything about it.
      if (cachedSegments.has(data.frag.url)) {
        // A returning visitor replays cached footage with nothing yet known
        // about today's connection. With that footage safely buffered, reach a
        // rung higher each time until a segment has to be fetched and measured.
        if (!measured && prior === undefined && bufferedAhead(video) >= 4) networkEstimate = Math.min(networkEstimate * 2, 16_000_000);
        // Start the estimator afresh so cached segments carry no weight in it.
        player.bandwidthEstimate = networkEstimate;
        return;
      }
      measured = true;
      networkEstimate = player.bandwidthEstimate;
      video.dataset.throughput = `${Math.round(networkEstimate / 1000)}kbps`;
      const now = Date.now();
      if (now - lastSaved > 2000) { lastSaved = now; rememberThroughput(networkEstimate); }
    });
    video.addEventListener('timeupdate', upgradeOpening);
    detach.push(() => video.removeEventListener('timeupdate', upgradeOpening));
    player.on(Hls.Events.LEVEL_SWITCHED, (_event, data) => {
      const level = player.levels[data.level];
      if (level) video.dataset.rung = `${level.width}x${level.height}`;
    });
    log('adaptive', sources.adaptive, { prior, startLevel: config.startLevel });
    player.on(Hls.Events.FRAG_LOADING, (_event, data) => log('load', data.frag.sn, `rung ${data.frag.level}`, `estimate ${Math.round(player.bandwidthEstimate / 1000)}kbps`, `ahead ${bufferedAhead(video).toFixed(1)}s`));
    player.on(Hls.Events.FRAG_LOAD_EMERGENCY_ABORTED, (_event, data) => log('abandoned', data.frag.sn, `rung ${data.frag.level}`));
    player.on(Hls.Events.ERROR, (_event, data) => log(data.fatal ? 'fatal' : 'error', data.details));
    player.on(Hls.Events.ERROR, (_event, data: ErrorData) => {
      if (!data.fatal || hls !== player) return;
      if (data.type === Hls.ErrorTypes.MEDIA_ERROR && !recoveredDecode) {
        recoveredDecode = true;
        player.recoverMediaError();
        return;
      }
      const started = player.levels.length > 0;
      if (data.type === Hls.ErrorTypes.NETWORK_ERROR && started && networkRetries < 3) {
        // A dropped connection mid-clip: keep the buffered footage and resume.
        networkRetries += 1;
        player.startLoad();
        return;
      }
      useProgressive();
    });
    player.on(Hls.Events.MEDIA_ATTACHED, attached);
    player.loadSource(sources.adaptive!);
    player.attachMedia(video);
  };

  const useNative = () => {
    mode = 'native';
    video.dataset.playback = mode;
    video.addEventListener('error', nativeFailed);
    if (frugal) video.preload = 'metadata';
    video.src = sources.adaptive!;
    video.load();
    attached();
  };

  if (!sources.adaptive) useProgressive();
  else if (Hls.isSupported()) useAdaptive();
  else if (video.canPlayType(NATIVE_HLS)) useNative();
  else useProgressive();

  return {
    get mode() { return mode; },
    retry() {
      if (destroyed) return;
      if (hls) { networkRetries = 0; hls.startLoad(); if (video.error) hls.recoverMediaError(); }
      else video.load();
    },
    linkFreed() { if (!destroyed) relearn(); },
    destroy() {
      destroyed = true;
      detach.forEach((remove) => remove());
      video.removeEventListener('error', nativeFailed);
      hls?.destroy();
      hls = null;
    },
  };
}

/** Attach once per element and source set; detach on unmount. */
export function useAdaptiveVideo(video: RefObject<HTMLVideoElement | null>, sources: VideoSources, options: AdaptiveVideoOptions = {}) {
  const controller = useRef<AdaptiveVideo | null>(null);
  const { adaptive, progressive } = sources;
  const { capToPlayerSize } = options;
  const onSourceAttached = useRef(options.onSourceAttached);
  onSourceAttached.current = options.onSourceAttached;
  useEffect(() => {
    if (!video.current) return;
    const attached = attachAdaptiveVideo(video.current, { adaptive, progressive }, { capToPlayerSize, onSourceAttached: () => onSourceAttached.current?.() });
    controller.current = attached;
    return () => { attached.destroy(); controller.current = null; };
  }, [video, adaptive, progressive, capToPlayerSize]);
  return controller;
}
