import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseSceneClipSave, SCENE_ID_PATTERN } from "@/lib/sceneSearch";
import { readSceneLibrary, saveSceneLibraryClip } from "@/lib/sceneLibrary";

export const dynamic = "force-dynamic";
const privateHeaders = { "Cache-Control": "private, no-store" };
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: privateHeaders });

export async function GET(request: Request) {
  const sceneId = new URL(request.url).searchParams.get("scene") || "";
  if (sceneId && !SCENE_ID_PATTERN.test(sceneId)) return reply({ error: "Invalid scene." }, 400);
  const result = await readSceneLibrary(await createClient(), sceneId);
  return reply(result.body, result.status);
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const expectedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || request.headers.get("host") || new URL(request.url).host;
  if (origin) {
    try { if (new URL(origin).host !== expectedHost) return reply({ error: "Cross-origin save denied." }, 403); }
    catch { return reply({ error: "Invalid origin." }, 403); }
  }
  const input = parseSceneClipSave(await request.json().catch(() => null));
  if (!input) return reply({ error: "Choose a valid clip and scene." }, 400);
  const result = await saveSceneLibraryClip(await createClient(), input);
  return reply(result.body, result.status);
}
