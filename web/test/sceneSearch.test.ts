import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { browseFiltersFromParams, browseParams } from "../lib/browseSearch";
import { parseSceneClipSave, sceneBrowseParams, sceneSearchHref } from "../lib/sceneSearch";

const id = "11111111-1111-4111-8111-111111111111";

test("scene searches seed only the user's description and retain the save destination", () => {
  const scene = { id, name: "Car chase", search_brief: "High-speed over bridge", generated_keywords: ["sedan", "rain"] };
  const url = new URL(sceneSearchHref(scene), "http://localhost");
  assert.equal(url.pathname, "/browse");
  assert.equal(url.searchParams.get("q"), scene.search_brief);
  assert.equal(url.searchParams.get("scene"), id);
  assert.equal(url.searchParams.has("stage"), false);
  assert.equal(url.searchParams.has("weather"), false);
  assert.equal(new URL(sceneSearchHref({ ...scene, search_brief: " " }), url).searchParams.get("q"), "Car chase");
});

test("refining, clearing, sorting and paging search retain the scene and pending clip", () => {
  const initial = new URL(sceneSearchHref({ id, name: "Scene" }, "PL-7014298"), "http://localhost");
  const filters = { ...browseFiltersFromParams(initial.searchParams), q: "coast", weather: "clear" };
  const params = sceneBrowseParams(browseParams({ filters, sort: "newest", page: 2 }), id, "PL-7014298");
  assert.equal(params.get("scene"), id);
  assert.equal(params.get("save"), "PL-7014298");
  assert.equal(params.get("q"), "coast");
  assert.equal(params.get("page"), "2");
  const cleared = sceneBrowseParams(browseParams({ filters: { ...filters, q: "", weather: null } }), id);
  assert.equal(cleared.get("scene"), id);
  assert.equal(cleared.has("save"), false);
  assert.equal(cleared.has("q"), false);
  assert.equal(initial.searchParams.get("q"), "Scene");
});

test("save requests require a specific scene and a catalog SKU", () => {
  assert.deepEqual(parseSceneClipSave({ sceneId: id, sku: "PL-7014298" }), { sceneId: id, sku: "PL-7014298" });
  for (const value of [null, {}, { sceneId: "oops", sku: "PL-7014298" }, { sceneId: id, sku: "../../secret" }, { sceneId: id, sku: 123 }]) {
    assert.equal(parseSceneClipSave(value), null);
  }
});

test("public scene entry uses universal search and no longer exposes script import", () => {
  const source = (file: string) => readFileSync(new URL(file, import.meta.url), "utf8");
  const scene = source("../app/projects/[projectId]/scenes/[sceneId]/page.tsx");
  assert.match(scene, /redirect\(sceneSearchHref\(scene\)\)/);
  assert.doesNotMatch(scene, /createQueryEmbedding|search_stock_clips|SceneKeywordPriorities/);
  for (const file of ["../app/projects/new/page.tsx", "../app/projects/[projectId]/page.tsx", "../components/SceneInputWorkspace.tsx"]) {
    assert.doesNotMatch(source(file), /SceneImportPanel|importPanel|Import scenes/);
  }
});
