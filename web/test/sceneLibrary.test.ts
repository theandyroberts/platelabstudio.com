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
  assert.deepEqual(await readSceneLibrary(client, ""), { status: 200, body: { authenticated: false, scenes: [], clips: [] } });
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
  const { client } = clientFixture(true, [{ data: [{ id: "scene", project_id: "project", name: "Chase", search_brief: "over bridge", projects: { name: "Film" } }] }, { data: [] }]);
  assert.deepEqual(await readSceneLibrary(client, "scene"), { status: 200, body: {
    authenticated: true, scenes: [{ id: "scene", projectId: "project", projectName: "Film", name: "Chase", brief: "over bridge" }], clips: [],
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
