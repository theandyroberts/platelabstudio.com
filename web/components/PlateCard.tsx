"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import type { Plate } from "@platelab/shared";
import { stitchStatus, formatUsd } from "@platelab/shared";
import { publicMediaUrl } from "@/lib/publicMediaUrl";
import { cardPreviewUrl } from "@/lib/browserPreview";
import { StitchStatus } from "./StitchStatus";
import { buildStudioHref } from "@/lib/studioHref";

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * Catalog card: poster at rest, watermarked preview plays on hover.
 *
 * A catalog page holds dozens of these, so a card requests no footage until a
 * visitor shows interest in it, and releases the connection when they move on.
 */
export function PlateCard({
  plate,
  browseReturnPath,
  onAdd, added = false, saving = false,
}: {
  plate: Plate;
  browseReturnPath?: string;
  onAdd?: () => void; added?: boolean; saving?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewWanted = useRef(false);
  const [playing, setPlaying] = useState(false);
  // Provisioned clips have a small file made for this hover; it is tried first.
  const preview = publicMediaUrl(plate.renditions.stitchedPreview);
  const card = cardPreviewUrl(plate.renditions.stitchedPreview);
  const hoverSources = card === plate.renditions.stitchedPreview ? [preview] : [card, preview];
  const hoverSource = useRef(0);
  const detailHref = browseReturnPath
    ? `/plate/${plate.sku}?from=${encodeURIComponent(browseReturnPath)}`
    : `/plate/${plate.sku}`;
  const studioHref = plate.composite ? `${detailHref}#plate-viewer` : plate.renditions.stagePreview
    ? buildStudioHref({
        video: publicMediaUrl(plate.renditions.stagePreview),
        label: `${plate.sku} · ${plate.title}`,
        fps: plate.media.fps,
        sourceTimecode: plate.media.timecode,
        sku: plate.sku,
      })
    : undefined;

  const start = () => {
    const v = videoRef.current;
    if (!v) return;
    previewWanted.current = true;
    if (!v.getAttribute("src")) v.src = hoverSources[hoverSource.current];
    void v.play().then(() => { if (!previewWanted.current) v.pause(); }).catch(() => setPlaying(false));
  };
  // A missing hover file falls back to the full preview once, for good.
  const failed = () => {
    setPlaying(false);
    const v = videoRef.current;
    if (!v || !v.getAttribute("src") || hoverSource.current >= hoverSources.length - 1) return;
    hoverSource.current += 1;
    if (!previewWanted.current) { v.removeAttribute("src"); return; }
    v.src = hoverSources[hoverSource.current];
    void v.play().catch(() => setPlaying(false));
  };
  const stop = () => {
    const v = videoRef.current;
    if (!v) return;
    previewWanted.current = false;
    v.pause();
    // Stop the download too, not only the picture.
    if (v.getAttribute("src")) { v.removeAttribute("src"); v.load(); }
    setPlaying(false);
  };

  return (
    <article
      data-stitch-status={stitchStatus(plate.stitchStatus)}
      data-preview-playing={playing}
      className={`plate-card${plate.composite ? " plate-card-composite" : ""}`}
      onMouseEnter={start}
      onMouseLeave={stop}
      onFocus={start}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) stop(); }}
    >
      <Link href={detailHref} className="plate-card-preview" aria-label={`Preview ${plate.title}`}>
        <div className="frame stitch-surface">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={publicMediaUrl(plate.renditions.poster)}
            alt={plate.title}
            loading="lazy"
          />
          <video
            ref={videoRef}
            className={playing ? "playing" : undefined}
            onPlaying={() => { if (previewWanted.current) setPlaying(true); else videoRef.current?.pause(); }}
            onPause={() => setPlaying(false)}
            onWaiting={() => setPlaying(false)}
            onError={failed}
            muted
            loop
            playsInline
            preload="none"
          />
          <div className="plate-preview-heading">
            <span className="sku-chip mono">{plate.sku}</span>
            <h3 className="plate-preview-description" title={plate.title}>{plate.title}</h3>
          </div>
          <span className="dur-chip mono">{formatDuration(plate.media.durationSec)}</span>
          <StitchStatus status={plate.stitchStatus} />
        </div>
      </Link>
      <div className="body">
        <div className="meta">
          <span className="mono dimmer">
            {plate.location.city}, {plate.location.region}
          </span>
          <span className="mono accent">{formatUsd(plate.pricing.totalUsd)}</span>
        </div>

      </div>
      <div className="plate-card-actions">
        {studioHref ? (
          <Link href={studioHref} className="plate-card-studio mono">
            Open in Lab <span aria-hidden="true">→</span>
          </Link>
        ) : (
          <span className="plate-card-studio is-unavailable mono">
            Lab preview pending
          </span>
        )}
        <button type="button" className="plate-card-project mono" data-added={added} disabled={!onAdd || added || saving} onClick={onAdd}>
          {added ? "Added to scene" : "Add to project"} <span aria-hidden="true">{added ? "✓" : "+"}</span>
        </button>
      </div>
    </article>
  );
}
