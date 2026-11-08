"use client";
import Link from "next/link";
import { stitchStatus, type Plate } from "@platelab/shared";
import { publicMediaUrl } from "@/lib/publicMediaUrl";
import { StitchStatus } from "./StitchStatus";
import styles from "./SceneClipWorkspace.module.css";

export function SceneClipCard({ plate, studioHref, duration, chosen, pending, onChoose, onRemove }: {
  plate: Plate; studioHref: string | null; duration: string | null; chosen: boolean; pending: boolean; onChoose: () => void; onRemove: () => void;
}) {
  return <article className={styles.card} data-chosen={chosen}>
    <Link href={`/plate/${plate.sku}`} className={`${styles.preview} stitch-surface`} data-stitch-status={stitchStatus(plate.stitchStatus)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className={styles.poster} src={publicMediaUrl(plate.renditions.poster)} alt={plate.title} loading="lazy" />
      <StitchStatus status={plate.stitchStatus} />
    </Link>
    <div className={styles.body}>
      <div className={styles.identity}><span className="mono">{plate.sku}</span>{chosen && <span className={styles.chosen}>✓ Chosen clip</span>}</div>
      <h3><Link href={`/plate/${plate.sku}`}>{plate.title}</Link></h3>
      {duration && <p className={styles.metadata}>Range: {duration}</p>}
      <div className={styles.actions}>
        <Link className={styles.action} href={studioHref || `/plate/${plate.sku}#plate-viewer`}>Open in Lab</Link>
        <button type="button" className={styles.choose} aria-pressed={chosen} disabled={pending} onClick={onChoose}>{chosen ? "Unchoose" : "Choose clip"}</button>
        <button type="button" className={styles.remove} aria-label={`Remove ${plate.sku} from scene`} disabled={pending} onClick={onRemove}>Remove</button>
      </div>
    </div>
  </article>;
}
