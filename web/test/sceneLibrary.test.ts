import assert from "node:assert/strict";
import test from "node:test";
import type { Database } from "@platelab/shared";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readSceneLibrary, saveSceneLibraryClip } from "../lib/sceneLibrary";

function clientFixture(authenticated: boolean, responses: Array<{ data: unknown; error?: unknown }> = []) {
  const calls: unknown[][] = [];
  const client = {
    auth: { getUser: async () => ({ data: { user: authenticated ? { id: "user" } : null } }) },
    from(table: string) {
      calls.push(["from", table]);
      const response = responses.shift();
      assert.ok(response, `Unexpected ${table} query`);
      const builder = {
        then(resolve: (result: unknown) => unknown) { return Promise.resolve({ error: null, ...response }).then(resolve); },
        select(...args: unknown[]) { calls.push(["select", ...args]); return builder; },
        eq(...args: unknown[]) { calls.push(["eq", ...args]); return builder; },
        in(...args: unknown[]) { calls.push(["in", ...args]); return builder; },
        neq(...args: unknown[]) { calls.push(["neq", ...args]); return builder; },
        is(...args: unknown[]) { calls.push(["is", ...args]); return builder; },
        order(...args: unknown[]) { calls.push(["order", ...args]); return builder; },
        maybeSingle() { return builder; },
      };
      return builder;
    },
    async rpc(...args: unknown[]) {
      calls.push(["rpc", ...args]);
      const response = responses.shift();
      assert.ok(response, "Unexpected mutation");
      return { error: null, ...response };
    },
  };
  return { client: client as unknown as SupabaseClient<Database>, calls };
}

test("anonymous browse exposes no saved data and cannot save clips", async () => {
  const { client, calls } = clientFixture(false);
  assert.deepEqual(await readSceneLibrary(client, ""), { status: 200, body: { authenticated: false, projects: [], scenes: [], clips: [], scenePreviews: [] } });
  assert.equal((await saveSceneLibraryClip(client, { sceneId: "scene", sku: "PL-7014298" })).status, 401);
  assert.deepEqual(calls, []);
});

test("inaccessible or archived scenes cannot expose another project's clips", async () => {
  const { client, calls } = clientFixture(true, [{ data: [] }]);
  assert.equal((await readSceneLibrary(client, "private-scene")).status, 404);
  assert.ok(calls.some(call => JSON.stringify(call) === JSON.stringify(["is", "archived_at", null])));
  assert.equal(calls.filter(call => call[0] === "from").length, 1);
});

test("library errors are explicit, not mistaken for an empty collection", async () => {
  const { client } = clientFixture(true, [{ data: null, error: { message: "offline" } }]);
  assert.equal((await readSceneLibrary(client, "")).status, 503);
});

test("readable scenes retain project association and the original brief", async () => {
  const { client } = clientFixture(true, [{ data: [{ id: "scene", project_id: "project", name: "Chase", search_brief: "over bridge", projects: { name: "Film" } }] }, { data: [{ id: "project", name: "Film" }] }, { data: [] }]);
  assert.deepEqual(await readSceneLibrary(client, "scene"), { status: 200, body: {
    authenticated: true, projects: [{ id: "project", name: "Film" }], scenes: [{ id: "scene", projectId: "project", projectName: "Film", name: "Chase", brief: "over bridge" }], clips: [], scenePreviews: [],
  } });
});

test("saving delegates permissions, duplicate handling, and audit to the existing RPC", async () => {
  const { client, calls } = clientFixture(true, [{ data: { id: "scene" } }, { data: { id: "stock" } }, { data: "saved-clip" }]);
  assert.deepEqual(await saveSceneLibraryClip(client, { sceneId: "scene", sku: "PL-7014298" }), { status: 200, body: { id: "saved-clip" } });
  assert.deepEqual(calls.at(-1), ["rpc", "add_clip_to_scene", { target_scene_id: "scene", target_stock_clip_id: "stock" }]);
  assert.ok(calls.some(call => JSON.stringify(call) === JSON.stringify(["eq", "status", "live"])));
});

test("read-only members receive a save failure, not false success", async () => {
  const { client } = clientFixture(true, [{ data: { id: "scene" } }, { data: { id: "stock" } }, { data: null, error: { message: "permission denied" } }]);
  assert.equal((await saveSceneLibraryClip(client, { sceneId: "scene", sku: "PL-7014298" })).status, 403);
});

test("unavailable clips and scenes never reach the mutation", async () => {
  for (const responses of [[{ data: null }], [{ data: { id: "scene" } }, { data: null }]]) {
    const { client, calls } = clientFixture(true, responses);
    assert.equal((await saveSceneLibraryClip(client, { sceneId: "scene", sku: "PL-7014298" })).status, 404);
    assert.ok(!calls.some(call => call[0] === "rpc"));
  }
});


test("empty active projects remain available in the search panel", async () => {
  const { client, calls } = clientFixture(true, [{ data: [] }, { data: [{ id: "empty-project", name: "New film" }] }]);
  assert.deepEqual(await readSceneLibrary(client, ""), { status: 200, body: {
    authenticated: true, projects: [{ id: "empty-project", name: "New film" }], scenes: [], clips: [], scenePreviews: [],
  } });
  assert.ok(calls.some(call => JSON.stringify(call) === JSON.stringify(["eq", "status", "active"])));
});

test("navigation includes each accessible scene's previews but active clips stay scoped", async () => {
  const { plateForComposite } = await import("../../shared/src/compositeCatalog");
  const plate = plateForComposite({
    id: "test-clip", stockId: "stock-id", sourceFingerprint: "source",
    enrichment: { status: "complete" }, localization: { status: "complete" }, publication: { warnings: [] }, watermark: { status: "detected" },
    title: "Bridge drive", description: "A captured environment.", tags: ["bridge"], labels: [{ label: "Bridge", confidence: .9, category: "scene" }], summary: { captureDate: "2024-01-04" },
    media: { duration: 12, fps: 24, width: 4096, height: 2048, codec: "prores", color: { primaries: "bt709", transfer: "unknown" } },
    hashes: { rough_stitch: "a".repeat(64) }, videoURL: "/composite-review/media/composite/test-clip/composite.mp4",
    crop: { height: 1152 }, coverage: { earliestBlackRowEstimate: 1100 },
    posterURL: "/composite-review/media/composite/test-clip/poster.jpg", sourceTimecode: "01:00:00:00", publishedAt: "2026-10-08T00:00:00Z",
  }, "PL-7014298", "approved-test", "2026-10-08T00:00:00Z");
  const scenes = ["scene-a", "scene-b"].map(id => ({ id, project_id: "project", name: id, search_brief: "", projects: { name: "Film" } }));
  const clips = scenes.map((scene, index) => ({ id: `clip-${index}`, scene_id: scene.id, status: "considering", version: 3, in_frame: 24, out_frame: 72, stock_clips: { source_metadata: plate } }));
  const { client, calls } = clientFixture(true, [{ data: scenes }, { data: [{ id: "project", name: "Film" }] }, { data: clips }]);
  const result = await readSceneLibrary(client, "scene-a");
  assert.equal(result.status, 200);
  const body = result.body as { clips: Array<{ id: string }>; scenePreviews: Array<{ sceneId: string; studioHref: string }> };
  assert.deepEqual(body.clips.map(clip => clip.id), ["clip-0"]);
  assert.deepEqual(body.scenePreviews.map(clip => clip.sceneId), ["scene-a", "scene-b"]);
  const href = new URL(body.scenePreviews[1].studioHref, "https://example.test");
  assert.equal(href.pathname, "/stage");
  assert.equal(href.searchParams.get("sceneId"), "scene-b");
  assert.equal(href.searchParams.get("version"), "3");
  assert.ok(calls.some(call => JSON.stringify(call) === JSON.stringify(["in", "scene_id", ["scene-a", "scene-b"]])));
  assert.ok(calls.some(call => JSON.stringify(call) === JSON.stringify(["neq", "status", "rejected"])));
});
