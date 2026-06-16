import type { Metadata } from "next";
import AdminShell from "@/components/admin/AdminShell";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "관리자 | 모즈나인",
  robots: { index: false, follow: false },
};

export default async function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();

  let adminName: string | undefined;
  if (auth.user) {
    const { data: profile } = await supabase
      .from("admin_profiles")
      .select("name")
      .eq("id", auth.user.id)
      .maybeSingle();
    adminName = profile?.name ?? auth.user.email ?? undefined;
  }

  return <AdminShell adminName={adminName}>{children}</AdminShell>;
}
