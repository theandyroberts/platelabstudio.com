import { NextResponse } from "next/server";
import { parseSceneClipStatusUpdate } from "@/lib/sceneClipWorkspace";
import { createClient } from "@/lib/supabase/server";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ sceneClipId: string }> },
) {
  const requestUrl = new URL(request.url);
  const origin = request.headers.get("origin");
  if (origin) {
    const forwardedHost = request.headers
      .get("x-forwarded-host")
      ?.split(",")[0]
      ?.trim();
    const expectedHost = forwardedHost || request.headers.get("host") || requestUrl.host;
    let originHost = "";
    try {
      originHost = new URL(origin).host;
    } catch {
      // Invalid origins never represent a same-origin browser request.
    }
    if (originHost !== expectedHost) {
      return NextResponse.json({ error: "Cross-origin update denied." }, { status: 403 });
    }
  }

  const { sceneClipId } = await params;
  if (!UUID_PATTERN.test(sceneClipId)) {
    return NextResponse.json({ error: "Invalid scene clip." }, { status: 400 });
  }

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const update = parseSceneClipStatusUpdate(input);
  if (!update) {
    return NextResponse.json(
      { error: "A valid clip status and record version are required." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in to update scene candidates." }, { status: 401 });
  }

  const { data: version, error } = await supabase.rpc("set_scene_clip_status", {
    target_scene_clip_id: sceneClipId, next_status: update.status, expected_version: update.expectedVersion,
  });
  if (error) {
    const conflict = error.code === "40001" || error.code === "23505" || error.code === "40P01";
    return NextResponse.json({ error: conflict
      ? "This scene changed in another session. Refresh and try again."
      : "This clip could not be updated. Check your project access and retry." }, { status: conflict ? 409 : 403 });
  }
  const { data: clip } = await supabase.from("scene_clips").select("scene_id").eq("id", sceneClipId).maybeSingle();
  const { data: sceneClips, error: readError } = clip
    ? await supabase.from("scene_clips").select("id, status, version").eq("scene_id", clip.scene_id)
    : { data: null, error: true };
  if (readError) return NextResponse.json({ error: "Saved, but the scene could not be refreshed. Reload to see the current choice." }, { status: 503 });
  return NextResponse.json({ status: update.status, version, sceneClips }, {
    headers: { "cache-control": "private, no-store" },
  });
}
