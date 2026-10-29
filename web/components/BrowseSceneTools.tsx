"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BookmarkSimple, FolderOpen, X } from "@phosphor-icons/react";
import { publicMediaUrl } from "@/lib/publicMediaUrl";
import { buildStudioHref } from "@/lib/studioHref";
import { formatSceneClipSelectionDuration } from "@/lib/sceneClipSelection";
import type { SearchScene, SavedSearchClip } from "@/lib/sceneSearch";
import type { SceneClipStatus } from "@/lib/sceneClipWorkspace";
import styles from "./BrowseSceneTools.module.css";

export function useBrowseSceneLibrary(sceneId: string, returnPath: string, onPendingSave: (sku: string | null) => void) {
  const router = useRouter();
  const [library, setLibrary] = useState<{ authenticated: boolean; scenes: SearchScene[]; clips: SavedSearchClip[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [pending, setPending] = useState(false);
  const [open, setOpen] = useState(false);
  const [revision, setRevision] = useState(0);
  const activeScene = useRef(sceneId);
  activeScene.current = sceneId;

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setLibrary(null);
    fetch(`/api/scene-library${sceneId ? `?scene=${encodeURIComponent(sceneId)}` : ""}`, { signal: controller.signal, cache: "no-store" })
      .then(async response => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Saved clips could not be loaded.");
        if (!controller.signal.aborted) setLibrary(body);
      })
      .catch(reason => { if (!controller.signal.aborted) setError(reason.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [sceneId, revision]);

  function signIn(sku?: string) {
    const url = new URL(returnPath, window.location.origin);
    if (sku) url.searchParams.set("save", sku);
    router.push(`/login?next=${encodeURIComponent(url.pathname + url.search)}`);
  }

  async function save(sku: string) {
    if (pending || loading) return;
    if (!library) { setError("Load your scenes before saving a clip."); return; }
    if (!library.authenticated) { signIn(sku); return; }
    if (!sceneId) { onPendingSave(sku); setOpen(true); return; }
    setPending(true);
    setFeedback("");
    setError("");
    const targetScene = sceneId;
    try {
      const response = await fetch("/api/scene-library", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ sceneId, sku }),
      });
      const body = await response.json();
      if (response.status === 401) { signIn(sku); return; }
      if (!response.ok) throw new Error(body.error || "The clip could not be saved.");
      if (activeScene.current !== targetScene) return;
      onPendingSave(null);
      setFeedback(`${sku} saved to ${library.scenes.find(scene => scene.id === sceneId)?.name || "scene"}.`);
      setRevision(value => value + 1);
    } catch (reason) {
      if (activeScene.current === targetScene) setError(reason instanceof Error ? reason.message : "The clip could not be saved.");
    } finally { setPending(false); }
  }

  async function setStatus(clip: SavedSearchClip, status: SceneClipStatus) {
    setPending(true);
    setError("");
    const targetScene = sceneId;
    try {
      const response = await fetch(`/api/scene-clips/${clip.id}/status`, {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ status, expectedVersion: clip.version }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "The clip could not be updated.");
      if (activeScene.current !== targetScene) return;
      setLibrary(current => current && ({ ...current, clips: current.clips.map(item => item.id === clip.id ? { ...item, ...body } : item) }));
      setFeedback(status === "selected" ? `${clip.plate.sku} added to quote.` : "Saved clips updated.");
    } catch (reason) {
      if (activeScene.current === targetScene) setError(reason instanceof Error ? reason.message : "The clip could not be updated.");
    } finally { setPending(false); }
  }

  return { library, loading, error, feedback, pending, open, setOpen, save, setStatus, signIn, retry: () => setRevision(value => value + 1) };
}

type SceneToolsProps = {
  state: ReturnType<typeof useBrowseSceneLibrary>;
  sceneId: string;
  pendingSku: string | null;
  onSceneChange: (id: string) => void;
  onSearchScene: (scene: SearchScene) => void;
  onPendingSave: (sku: string | null) => void;
};

export function BrowseSceneTools({ state, sceneId, pendingSku, onSceneChange, onSearchScene, onPendingSave }: SceneToolsProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const scene = state.library?.scenes.find(item => item.id === sceneId);
  const [tab, setTab] = useState<"saved" | "quote" | "dismissed">("saved");
  const clips = state.library?.clips ?? [];
  const saved = clips.filter(clip => clip.status !== "rejected");
  const quoted = saved.filter(clip => clip.status === "selected" || clip.status === "submitted");
  const visible = tab === "quote" ? quoted : tab === "dismissed" ? clips.filter(clip => clip.status === "rejected") : saved;

  useEffect(() => {
    if (state.open && !dialog.current?.open) dialog.current?.showModal();
    if (!state.open && dialog.current?.open) dialog.current?.close();
    if (!state.open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [state.open]);

  const selector = (id: string) => (
    <label className={styles.destination}>
      <span>Save to scene</span>
      <select id={id} value={sceneId} disabled={state.loading || state.pending} onChange={event => onSceneChange(event.target.value)}>
        <option value="">Choose a project / scene</option>
        {state.library?.scenes.map(item => <option key={item.id} value={item.id}>{item.projectName} / {item.name}</option>)}
      </select>
    </label>
  );
  const newProjectHref = `/projects/new${pendingSku ? `?save=${encodeURIComponent(pendingSku)}` : ""}`;

  return (
    <>
      <div className={styles.context}>
        {state.library?.authenticated ? <>
          {selector("search-scene")}
          {scene && <>
            <button className="secondary-button" onClick={() => onSearchScene(scene)}>Search this scene</button>
            <Link href={`/projects/${scene.projectId}`} className="secondary-button"><FolderOpen size={16} /> Go to project</Link>
          </>}
          {!scene && <Link href="/projects" className="secondary-button"><FolderOpen size={16} /> Projects</Link>}
        </> : <span className="mono dim">Plate library</span>}
        <button className="secondary-button" onClick={() => state.setOpen(true)} aria-haspopup="dialog">
          <BookmarkSimple size={17} /> Saved clips{scene ? ` (${saved.length})` : ""}
        </button>
      </div>
      {pendingSku && <div className={styles.pendingSave}>
        <span>{pendingSku}</span>
        <button className="primary-button" disabled={state.loading || state.pending} onClick={() => state.save(pendingSku)}>Save to scene</button>
        <button title="Cancel saving clip" aria-label="Cancel saving clip" onClick={() => onPendingSave(null)}><X size={18} /></button>
      </div>}
      {!state.open && state.error && <p className={styles.error} role="alert">{state.error} <button onClick={state.retry}>Retry</button>{sceneId && <button onClick={() => onSceneChange("")}>Choose another scene</button>}</p>}
      {!state.open && state.feedback && <p className={styles.feedback} role="status">{state.feedback}</p>}
      <dialog ref={dialog} className={styles.drawer} aria-labelledby="saved-clips-heading" onClose={() => state.setOpen(false)} onClick={event => { if (event.target === dialog.current) state.setOpen(false); }}>
        <div className={styles.drawerContent}>
          <header className={styles.drawerHeader}>
            <h2 id="saved-clips-heading">Saved clips</h2>
            <button autoFocus title="Close saved clips" aria-label="Close saved clips" onClick={() => state.setOpen(false)}><X size={22} /></button>
          </header>
          {state.loading ? <p role="status">Loading scenes...</p> : state.library?.authenticated ? <>
            {selector("saved-scene")}
            <div className={styles.links}>
              {scene && <Link href={`/projects/${scene.projectId}${pendingSku ? `?save=${encodeURIComponent(pendingSku)}` : ""}#add-scene`}>Add scene</Link>}
              <Link href={newProjectHref}>New project</Link>
            </div>
            {pendingSku && <button className="primary-button" disabled={!scene || state.pending} onClick={() => state.save(pendingSku)}>Save {pendingSku} to scene</button>}
            {scene && <>
              <div className={styles.tabs} role="tablist" aria-label="Saved clip views">
                {(["saved", "quote", "dismissed"] as const).map(value => <button key={value} role="tab" aria-selected={tab === value} aria-controls="saved-clip-list" onClick={() => setTab(value)}>{value === "saved" ? `Saved (${saved.length})` : value === "quote" ? `In quote (${quoted.length})` : "Dismissed"}</button>)}
              </div>
              <div id="saved-clip-list" role="tabpanel" aria-label={tab}>
                {!visible.length && <p className={styles.empty}>{tab === "quote" ? "No clips in quote." : tab === "dismissed" ? "No dismissed clips." : "No saved clips for this scene."}</p>}
                {visible.map(clip => {
                  const inQuote = clip.status === "selected" || clip.status === "submitted";
                  const duration = formatSceneClipSelectionDuration(clip.inFrame, clip.outFrame, clip.plate.media.fps);
                  const studioHref = clip.plate.renditions.stagePreview ? buildStudioHref({
                    video: publicMediaUrl(clip.plate.renditions.stagePreview), label: `${clip.plate.sku} · ${clip.plate.title}`,
                    fps: clip.plate.media.fps, sourceTimecode: clip.plate.media.timecode, sku: clip.plate.sku,
                    scene: { projectId: scene.projectId, projectName: scene.projectName, sceneId: scene.id, sceneName: scene.name },
                    selection: { sceneClipId: clip.id, version: clip.version, inFrame: clip.inFrame, outFrame: clip.outFrame },
                  }) : null;
                  return <article key={clip.id} className={styles.clip}>
                    <Link href={`/plate/${clip.plate.sku}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={publicMediaUrl(clip.plate.renditions.poster)} alt={clip.plate.title} loading="lazy" />
                    </Link>
                    <div><span className="mono dim">{clip.plate.sku}</span><h3>{clip.plate.title}</h3>{duration && <p>Saved range: {duration}</p>}</div>
                    <div className={styles.clipActions}>
                      {studioHref && <Link className="secondary-button" href={studioHref}>Open in Studio</Link>}
                      <button className={inQuote ? "secondary-button" : "primary-button"} disabled={state.pending} onClick={() => state.setStatus(clip, inQuote || clip.status === "rejected" ? "considering" : "selected")}>{inQuote ? "Remove from quote" : clip.status === "rejected" ? "Restore clip" : "Add to quote"}</button>
                      {clip.status !== "rejected" && <button className="secondary-button" disabled={state.pending} onClick={() => state.setStatus(clip, "rejected")}>Dismiss</button>}
                    </div>
                  </article>;
                })}
              </div>
            </>}
          </> : !state.error && <Link href={`/login?next=${encodeURIComponent(typeof window === "undefined" ? "/browse" : window.location.pathname + window.location.search)}`} className="primary-button">Sign in to save clips</Link>}
          {state.error && <p className={styles.error} role="alert">{state.error} <button onClick={state.retry}>Retry</button>{sceneId && <button onClick={() => onSceneChange("")}>Choose another scene</button>}</p>}
          {state.feedback && <p className={styles.feedback} role="status">{state.feedback}</p>}
        </div>
      </dialog>
    </>
  );
}
