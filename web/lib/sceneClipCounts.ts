export type SceneClipStatus =
  | "considering"
  | "shortlisted"
  | "selected"
  | "rejected"
  | "submitted";

type SceneClipStatusRow = {
  status: SceneClipStatus;
};

export function sceneClipCounts(rows: SceneClipStatusRow[] | null | undefined) {
  return (rows ?? []).reduce(
    (counts, row) => {
      if (row.status === "considering" || row.status === "shortlisted") counts.considering += 1;
      if (row.status === "selected" || row.status === "submitted") counts.selected += 1;
      return counts;
    },
    { considering: 0, selected: 0 },
  );
}
