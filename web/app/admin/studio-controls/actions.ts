"use server";

import { requireAdmin } from "@/lib/admin/session";
import { writeStudioConfig } from "@/lib/admin/studioConfig";

export async function saveStudioControls(controls: unknown) {
  await requireAdmin();
  try {
    const config = writeStudioConfig(controls);
    return { ok: true as const, config };
  } catch {
    return { ok: false as const, error: "Settings could not be saved. Check the configuration and persistent storage, then retry." };
  }
}
