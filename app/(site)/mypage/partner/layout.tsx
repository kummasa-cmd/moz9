import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function MypagePartnerLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/mypage/partner");

  const admin = createAdminClient();
  const { data: member } = await admin
    .from("members")
    .select("is_partner")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!member?.is_partner) redirect("/mypage");

  return <>{children}</>;
}
