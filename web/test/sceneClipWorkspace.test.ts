import assert from "node:assert/strict";
import test from "node:test";
import {
  parseSceneClipStatusUpdate,
  sceneClipWorkspaceTab,
} from "../lib/sceneClipWorkspace";

test("parses versioned status changes", () => {
  assert.deepEqual(
    parseSceneClipStatusUpdate({ status: "rejected", expectedVersion: 4 }),
    { status: "rejected", expectedVersion: 4 },
  );
  assert.equal(
    parseSceneClipStatusUpdate({ status: "deleted", expectedVersion: 4 }),
    null,
  );
  assert.equal(
    parseSceneClipStatusUpdate({ status: "selected", expectedVersion: 0 }),
    null,
  );
});

test("groups retained workflow states into three readable workspace tabs", () => {
  assert.equal(sceneClipWorkspaceTab("considering"), "considering");
  assert.equal(sceneClipWorkspaceTab("shortlisted"), "considering");
  assert.equal(sceneClipWorkspaceTab("selected"), "selected");
  assert.equal(sceneClipWorkspaceTab("submitted"), "selected");
  assert.equal(sceneClipWorkspaceTab("rejected"), "rejected");
});

test("intermediate statuses cannot be submitted by the simplified workflow", () => {
  for (const status of ["shortlisted", "submitted"]) assert.equal(parseSceneClipStatusUpdate({ status, expectedVersion: 2 }), null);
});

test("a replacement choice updates both versions without losing saved clip metadata", async () => {
  const { applySceneClipChanges, isChosenClip } = await import("../lib/sceneClipWorkspace");
  const clips = [{ id: "a", status: "selected" as const, version: 2, title: "First" }, { id: "b", status: "considering" as const, version: 1, title: "Second" }];
  const next = applySceneClipChanges(clips, [{ id: "a", status: "considering", version: 3 }, { id: "b", status: "selected", version: 2 }]);
  assert.equal(next.filter(clip => isChosenClip(clip.status)).length, 1);
  assert.equal(next[0].title, "First");
  assert.equal(next[0].version, 3);
  assert.equal(next[1].version, 2);
});
