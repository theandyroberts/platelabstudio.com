import assert from "node:assert/strict";
import test from "node:test";
import { isStaticAssetPath } from "../lib/staticAssetPath";

test("footage, models and viewer bundles skip the session check", () => {
  for (const pathname of [
    "/media/site/mustang-study14-reflections-stream-v1/360p/seg-000.m4s",
    "/media/PL-4180192/stitched_preview.mp4",
    "/composite-review/media/composite/clip-a/stream-v1/master.m3u8",
    "/composite-review/media/composite/clip-a/motion.json",
    "/stage/index.html",
    "/stage/models/ferrari.glb",
    "/imported-stage/assets/index.js",
    "/branding/plate-lab-globe.svg",
  ]) {
    assert.equal(isStaticAssetPath(pathname), true, pathname);
  }
});

test("pages and APIs keep the session check", () => {
  for (const pathname of [
    "/",
    "/stage",
    "/browse",
    "/plate/PL-1630021",
    "/projects/new",
    "/api/scene-library",
    "/composite-review",
    "/mediakit",
  ]) {
    assert.equal(isStaticAssetPath(pathname), false, pathname);
  }
});
