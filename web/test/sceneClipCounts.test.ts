import assert from "node:assert/strict";
import test from "node:test";
import { sceneClipCounts } from "../lib/sceneClipCounts";

test("counts saved and in-quote clips including retained legacy states", () => {
  assert.deepEqual(
    sceneClipCounts([
      { status: "considering" },
      { status: "selected" },
      { status: "considering" },
      { status: "shortlisted" },
      { status: "rejected" },
      { status: "submitted" },
    ]),
    { considering: 3, selected: 2 },
  );
});

test("returns zero counts when a scene has no saved plates", () => {
  assert.deepEqual(sceneClipCounts(undefined), {
    considering: 0,
    selected: 0,
  });
});
