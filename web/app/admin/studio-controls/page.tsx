import Link from "next/link";
import { requireAdmin } from "@/lib/admin/session";
import { readStudioConfig } from "@/lib/admin/studioConfig";
import { StudioControlSettings } from "@/components/admin/StudioControlSettings";
import { siteTitle } from "@/lib/siteTitle";

export const dynamic = "force-dynamic";
export const metadata = { title: siteTitle("360 Studio controls - TPL Admin") };

export default async function StudioControlsPage() {
  await requireAdmin();
  return <main className="wrap" style={{ paddingTop: 40 }}>
    <nav aria-label="Admin navigation" style={{ display: "flex", gap: 24, flexWrap: "wrap", marginBottom: 32 }}>
      <Link href="/admin/studio-controls" aria-current="page">Studio controls</Link>
      <Link href="/admin/handoffs">Handoffs</Link>
      <Link href="/admin/drafts">Draft queue</Link>
      <Link href="/admin/stitch">Stitch review</Link>
    </nav>
    <StudioControlSettings initial={readStudioConfig()} />
  </main>;
}
