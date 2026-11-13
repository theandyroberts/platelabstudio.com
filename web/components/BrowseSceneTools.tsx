"use client";
import { SceneClipCard } from "./SceneClipCard";
import { applySceneClipChanges, isChosenClip } from "@/lib/sceneClipWorkspace";

import Link from "next/link";
import { stitchStatus } from "@platelab/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CaretLeft, CaretRight, FolderOpen, X } from "@phosphor-icons/react";
import { publicMediaUrl } from "@/lib/publicMediaUrl";
import { buildStudioHref } from "@/lib/studioHref";
import { formatSceneClipSelectionDuration } from "@/lib/sceneClipSelection";
import type { SearchScene, SavedSearchClip, ScenePreview } from "@/lib/sceneSearch";
import type { SceneClipStatus } from "@/lib/sceneClipWorkspace";
import styles from "./BrowseSceneTools.module.css";

export function useBrowseSceneLibrary(sceneId: string, returnPath: string, onPendingSave: (sku: string | null) => void) {
  const router = useRouter();
  const [library, setLibrary] = useState<{ authenticated: boolean; scenes: SearchScene[]; projects: { id: string; name: string }[]; clips: SavedSearchClip[]; scenePreviews: ScenePreview[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [pending, setPending] = useState(false);
  const [open, updateOpen] = useState(true);
  useEffect(() => {
    try { updateOpen(localStorage.getItem("platelab-search-panel") !== "collapsed"); } catch { /* Storage is optional. */ }
  }, []);
  const setOpen = useCallback((value: boolean) => {
    updateOpen(value);
    try { localStorage.setItem("platelab-search-panel", value ? "open" : "collapsed"); } catch { /* Storage is optional. */ }
  }, []);
  const [revision, setRevision] = useState(0);
  const activeScene = useRef(sceneId);
  activeScene.current = sceneId;
  useEffect(() => { setFeedback(""); }, [sceneId]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    fetch(`/api/scene-library${sceneId ? `?scene=${encodeURIComponent(sceneId)}` : ""}`, { signal: controller.signal, cache: "no-store" })
      .then(async response => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Saved clips could not be loaded.");
        if (!controller.signal.aborted) setLibrary(body);
      })
      .catch(reason => { if (!controller.signal.aborted) { setLibrary(null); setError(reason.message); } })
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
      window.dispatchEvent(new Event('platelab-order-updated'));
      if (activeScene.current !== targetScene) return;
      setLibrary(current => current && ({ ...current, clips: applySceneClipChanges(current.clips, body.sceneClips), scenePreviews: status === "rejected" ? current.scenePreviews.filter(item => item.id !== clip.id) : current.scenePreviews }));
      setRevision(value => value + 1);
      setFeedback(status === "selected" ? `${clip.plate.sku} chosen for this scene.` : "Saved clips updated.");
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

export function ActiveSceneClips({ state, sceneId, pendingSku, onSceneChange, onSearchScene, onPendingSave }: SceneToolsProps) {
  const scene = state.library?.scenes.find(item => item.id === sceneId);
  const visible = state.loading ? [] : (state.library?.clips ?? []).filter(clip => clip.status !== "rejected");
  const clipCards = scene ? <>
                {visible.map(clip => {
                  const inOrder = clip.status === "selected" || clip.status === "submitted";
                  const duration = formatSceneClipSelectionDuration(clip.inFrame, clip.outFrame, clip.plate.media.fps);
                  const studioHref = clip.plate.renditions.stagePreview ? buildStudioHref({
                    video: publicMediaUrl(clip.plate.renditions.stagePreview), label: `${clip.plate.sku} · ${clip.plate.title}`,
                    fps: clip.plate.media.fps, sourceTimecode: clip.plate.media.timecode, sku: clip.plate.sku,
                    scene: { projectId: scene.projectId, projectName: scene.projectName, sceneId: scene.id, sceneName: scene.name },
                    selection: { sceneClipId: clip.id, version: clip.version, inFrame: clip.inFrame, outFrame: clip.outFrame },
                  }) : null;
                  return <SceneClipCard compact key={clip.id} plate={clip.plate} studioHref={studioHref} duration={duration} chosen={isChosenClip(clip.status)} pending={state.pending} onChoose={() => state.setStatus(clip, inOrder ? "considering" : "selected")} onRemove={() => state.setStatus(clip, "rejected")} />;
                })}
  </> : null;

  return <section className={styles.activeWorkspace} aria-label="Active scene and saved clips">
    <div className={styles.activeHeading}>
      <label className={styles.sceneSelector}>
        <span>Active scene:</span>
        <select aria-label="Active scene" value={sceneId} disabled={state.pending || state.loading} onChange={event => onSceneChange(event.target.value)}>
          <option value="">{state.loading ? "Loading scenes…" : "Choose a scene"}</option>
          {state.library?.projects.map(project => <optgroup key={project.id} label={project.name}>
            {state.library!.scenes.filter(item => item.projectId === project.id).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </optgroup>)}
        </select>
      </label>
      {scene && <button className={styles.searchScene} onClick={() => onSearchScene(scene)}>Search this scene →</button>}
    </div>
    {scene && <p className={styles.sceneContext}>{scene.projectName} · {state.loading ? "Loading clips…" : `${visible.length} saved clip${visible.length === 1 ? "" : "s"}`}</p>}
    {pendingSku && <div className={styles.pendingSave}><span>{pendingSku}</span><button className="primary-button" disabled={!scene || state.pending || state.loading} onClick={() => state.save(pendingSku)}>Save to scene</button><button aria-label="Cancel saving clip" onClick={() => onPendingSave(null)}><X size={18} /></button></div>}
    {visible.length > 0 ? <div className={styles.selectedClips} role="region" aria-label="Saved scene clips" tabIndex={0}>{clipCards}</div> : !state.loading && <p className={styles.empty}>{scene ? "Add clips from the results below to compare them for this scene." : state.library?.authenticated ? "Choose a scene, or browse the full plate library below." : <button onClick={() => state.signIn()}>Sign in to organize plates into projects and scenes →</button>}</p>}
    {state.error && <p className={styles.error} role="alert">{state.error} <button onClick={state.retry}>Retry</button></p>}
    {state.feedback && <p className={styles.feedback} role="status">{state.feedback}</p>}
  </section>;
}

export function BrowseSceneTools({ state, sceneId, onSceneChange }: SceneToolsProps) {
  return <div className={styles.rail} data-open={state.open}>
    <aside id="search-scene-panel" className={styles.drawer} aria-label="Projects and scenes" inert={!state.open}>
      <div className={styles.drawerContent}>
        <header className={styles.drawerHeader}><h2>Projects & scenes</h2><button aria-label="Collapse projects and scenes" onClick={() => state.setOpen(false)}><CaretLeft size={18} /></button></header>
        {state.library?.authenticated ? <nav className={styles.projectTree} aria-label="Projects and scenes">
          {state.library.projects.map(project => <details key={project.id} open className={styles.project}>
            <summary><FolderOpen size={17} /><span>{project.name}</span></summary>
            <div className={styles.scenes}>
              {state.library!.scenes.filter(item => item.projectId === project.id).map(item => <div key={item.id} className={styles.sceneGroup}>
                <button className={styles.sceneButton} aria-current={sceneId === item.id ? "true" : undefined} disabled={state.pending || state.loading} onClick={() => onSceneChange(item.id)}>{item.name}</button>
                <div className={styles.tinyClips}>
                  {state.library!.scenePreviews.filter(clip => clip.sceneId === item.id).map(clip => <Link key={clip.id} className={styles.tinyClip} href={clip.studioHref} aria-label={`Open ${clip.sku} in Lab 360: ${clip.title}`}>
                    <span className={`${styles.tinyImage} stitch-surface`} data-stitch-status={stitchStatus(clip.stitchStatus)}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={clip.poster} alt="" loading="lazy" />
                    </span>
                    <span><strong>{clip.sku}</strong><span className={styles.tinyTitle}>{clip.title}</span></span>
                  </Link>)}
                </div>
              </div>)}
              {!state.library!.scenes.some(item => item.projectId === project.id) && <p className={styles.empty}>No scenes yet.</p>}
            </div>
          </details>)}
          {!state.library.projects.length && <Link href="/projects/new">Create a project →</Link>}
        </nav> : <p className={styles.empty}>{state.loading ? "Loading projects…" : "Your projects and scenes will appear here when you sign in."}</p>}
      </div>
    </aside>
    <button className={styles.panelToggle} aria-expanded={state.open} aria-controls="search-scene-panel" aria-label={state.open ? "Collapse projects and scenes" : "Show projects and scenes"} onClick={() => state.setOpen(!state.open)}>{state.open ? <CaretLeft size={16} /> : <CaretRight size={16} />}</button>
  </div>;
}
