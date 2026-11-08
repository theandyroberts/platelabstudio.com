"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Plate } from "@platelab/shared";
import { applySceneClipChanges, isChosenClip, type SceneClipStatus } from "@/lib/sceneClipWorkspace";
import { SceneClipCard } from "./SceneClipCard";
import styles from "./SceneClipWorkspace.module.css";
export type SceneClipWorkspaceCandidate = { id: string; status: SceneClipStatus; version: number; plate: Plate; studioHref: string | null; selectedDuration: string | null };
export function SceneClipWorkspace({ initialCandidates }: { initialCandidates: SceneClipWorkspaceCandidate[] }) {
  const [candidates, setCandidates] = useState(initialCandidates);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();
  const visible = candidates.filter(clip => clip.status !== "rejected");
  async function update(candidate: SceneClipWorkspaceCandidate, status: "considering" | "selected" | "rejected") {
    setPending(true); setError(""); setFeedback("");
    try {
      const response = await fetch(`/api/scene-clips/${candidate.id}/status`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status, expectedVersion: candidate.version }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "The clip could not be updated.");
      setCandidates(current => applySceneClipChanges(current, body.sceneClips));
      window.dispatchEvent(new Event("platelab-order-updated"));
      setFeedback(status === "selected" ? `${candidate.plate.sku} chosen for this scene and added to your order.` : status === "rejected" ? `${candidate.plate.sku} removed from this scene.` : "Choice cleared. Your clips are still saved.");
      router.refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to save. Please retry."); }
    finally { setPending(false); }
  }
  return <div className={styles.workspace}>
    <p className={styles.help}>{visible.length} clips · Choose one for this scene. You can change your choice anytime.</p>
    {feedback && <p className={styles.feedback} role="status">{feedback}</p>}
    {error && <p className={styles.error} role="alert">{error} <button onClick={() => window.location.reload()}>Refresh</button></p>}
    <div className={styles.grid}>{visible.map(clip => <SceneClipCard key={clip.id} plate={clip.plate} studioHref={clip.studioHref} duration={clip.selectedDuration} chosen={isChosenClip(clip.status)} pending={pending} onChoose={() => update(clip, isChosenClip(clip.status) ? "considering" : "selected")} onRemove={() => update(clip, "rejected")} />)}</div>
    {!visible.length && <p className={styles.empty}>No clips yet. Add clips from search to compare them here.</p>}
  </div>;
}
