import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/session";
import { AdminConsole } from "@/components/admin/AdminConsole";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const admin = await getAdminSession();
  if (!admin) redirect("/admin/login");
  return <AdminConsole adminEmail={admin.email} />;
}
