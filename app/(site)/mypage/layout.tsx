import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import MypageSidebar from "@/components/mypage/MypageSidebar";

export default async function MypageLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login?next=/mypage");

  const admin = createAdminClient();
  const { data: member } = await admin
    .from("members")
    .select("nickname, email")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!member) redirect("/login?error=회원 정보를 찾을 수 없습니다.&next=/mypage");

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="flex gap-6 items-start">
        <MypageSidebar nickname={member.nickname} email={member.email} />
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}
