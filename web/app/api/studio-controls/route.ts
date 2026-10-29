import { readStudioConfig } from "@/lib/admin/studioConfig";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json(readStudioConfig(), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Studio controls are temporarily unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
