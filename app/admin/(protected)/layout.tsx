import type { Metadata } from "next";
import { redirect } from "next/navigation";
import AdminShell from "@/components/admin/AdminShell";
import { getAdminSession } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = {
  title: "관리자 | 모즈나인",
  robots: { index: false, follow: false },
};

export default async function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const adminId = await getAdminSession();
  if (!adminId) redirect("/admin/login");

  const supabase = createAdminClient();
  const { data: admin } = await supabase
    .from("admins")
    .select("name")
    .eq("id", adminId)
    .maybeSingle();

  return <AdminShell adminName={admin?.name ?? undefined}>{children}</AdminShell>;
}
