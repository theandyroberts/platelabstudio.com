import { mkdirSync, readFileSync, renameSync, writeFileSync, unlinkSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { studioControlPreset, validateStudioControls } from "../../../shared/src/studio-controls.js";

export type StudioConfig = { version: 1; controls: Record<string, boolean>; updatedAt: string | null };

export function studioConfigPath() {
  return process.env.STUDIO_CONFIG_PATH ?? path.join(process.cwd(), "public/media/site/studio-controls.json");
}

export function readStudioConfig(file = studioConfigPath()): StudioConfig {
  let raw: string;
  try { raw = readFileSync(file, "utf8"); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { version: 1, controls: studioControlPreset(), updatedAt: null };
    throw error;
  }
  const data = JSON.parse(raw);
  if (data.version !== 1) throw new Error("Unsupported studio configuration version");
  return { version: 1, controls: validateStudioControls(data.controls), updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : null };
}

export function writeStudioConfig(controls: unknown, file = studioConfigPath()): StudioConfig {
  const data: StudioConfig = { version: 1, controls: validateStudioControls(controls), updatedAt: new Date().toISOString() };
  mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, JSON.stringify(data, null, 2) + "\n", { flag: "wx", mode: 0o644 });
    renameSync(temporary, file);
  } finally {
    try { unlinkSync(temporary); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  }
  return data;
}
