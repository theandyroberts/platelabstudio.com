/** Publication approval is separate from the quality of the stitched footage. */
export const STITCH_STATUSES = ["rough", "computer", "production-ready"] as const;
export type StitchStatus = (typeof STITCH_STATUSES)[number];

export function stitchStatus(value?: string | null): StitchStatus {
  return value === "production-ready" || value === "computer" ? value : "rough";
}

export const STITCH_STATUS_LABELS: Record<StitchStatus, string> = {
  rough: "Rough stitch",
  computer: "Computer stitch",
  "production-ready": "PROD stitch",
};
