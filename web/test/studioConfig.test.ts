import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { readStudioConfig, writeStudioConfig } from "../lib/admin/studioConfig";
import { STUDIO_CONTROLS, studioControlPreset, validateStudioControls } from "../../shared/src/studio-controls.js";

test("recommended Studio controls hide technical inputs and preserve buying essentials", () => {
  const controls = studioControlPreset();
  assert.equal(new Set(STUDIO_CONTROLS.map(control => control.id)).size, STUDIO_CONTROLS.length);
  for (const id of ["videoFile", "videoUrl", "cropTop", "sourceMode", "diameter", "imu-offset"]) assert.equal(controls[id], false);
  for (const id of ["vehicleSelect", "finishSwatches", "presetSelect", "cameraFocal", "downloadScreenshot"]) assert.equal(controls[id], true);
});

test("Studio visibility rejects unknown, missing, non-boolean and malformed input", () => {
  for (const invalid of [null, [], {}, { ...studioControlPreset(), unexpected: true }, { ...studioControlPreset(), videoUrl: "false" }]) {
    assert.throws(() => validateStudioControls(invalid));
  }
  assert.deepEqual(validateStudioControls(studioControlPreset(false)), studioControlPreset(false));
});

test("Studio settings persist atomically, including hide all, without touching rendering values", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "tpl-studio-config-"));
  const file = path.join(dir, "site", "studio-controls.json");
  try {
    assert.deepEqual(readStudioConfig(file).controls, studioControlPreset());
    writeStudioConfig(studioControlPreset(false), file);
    assert.deepEqual(readStudioConfig(file).controls, studioControlPreset(false));
    writeStudioConfig(studioControlPreset(true), file);
    assert.deepEqual(readStudioConfig(file).controls, studioControlPreset(true));
    assert.deepEqual(readdirSync(path.dirname(file)), ["studio-controls.json"]);
    const previous = readFileSync(file, "utf8");
    assert.throws(() => writeStudioConfig({ videoUrl: true }, file));
    assert.equal(readFileSync(file, "utf8"), previous);
    writeFileSync(file, "{invalid");
    assert.throws(() => readStudioConfig(file));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("admin page and mutation both require an authenticated admin", () => {
  for (const file of ["../app/admin/studio-controls/page.tsx", "../app/admin/studio-controls/actions.ts"]) {
    assert.match(readFileSync(new URL(file, import.meta.url), "utf8"), /await requireAdmin\(\)/);
  }
});
