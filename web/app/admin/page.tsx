import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin/session";

export default async function AdminPage() {
  await requireAdmin();
  redirect("/admin/studio-controls");
}
