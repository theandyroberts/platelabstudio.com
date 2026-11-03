import { stitchStatus, STITCH_STATUS_LABELS, type StitchStatus as Status } from "@platelab/shared";

export function StitchStatus({ status, overlay = false }: { status?: Status; overlay?: boolean }) {
  const value = stitchStatus(status);
  return <span className={`stitch-status-label${overlay ? " stitch-viewer-label" : ""}`} data-stitch-status={value}>{STITCH_STATUS_LABELS[value]}</span>;
}
