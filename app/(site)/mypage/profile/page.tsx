import { createClient } from "@/lib/supabase/server";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateProfile, updatePassword } from "./actions";

type Props = {
  searchParams: Promise<{ error?: string; success?: string }>;
};

export default async function ProfilePage({ searchParams }: Props) {
  const { error, success } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: member } = await supabase
    .from("members")
    .select("nickname, email, created_at")
    .eq("user_id", user!.id)
    .maybeSingle();

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-bold text-foreground">회원정보 수정</h1>

      {success === "1" && (
        <p className="text-sm text-green-600 bg-green-50 rounded-lg px-4 py-3">닉네임이 변경되었습니다.</p>
      )}
      {success === "2" && (
        <p className="text-sm text-green-600 bg-green-50 rounded-lg px-4 py-3">비밀번호가 변경되었습니다.</p>
      )}
      {error && !success && (
        <p className="text-sm text-destructive bg-destructive/5 rounded-lg px-4 py-3">{error}</p>
      )}

      {/* Profile info */}
      <div className="rounded-xl border border-border bg-white p-6 space-y-5">
        <h2 className="text-sm font-semibold text-foreground">기본 정보</h2>

        <div className="space-y-2">
          <Label>이메일</Label>
          <Input value={member?.email ?? ""} readOnly className="bg-muted/40 cursor-not-allowed" />
        </div>

        <form action={updateProfile} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="nickname">닉네임</Label>
            <Input
              id="nickname"
              name="nickname"
              required
              defaultValue={member?.nickname ?? ""}
              placeholder="닉네임을 입력하세요"
            />
          </div>
          <button
            type="submit"
            className="inline-flex items-center justify-center rounded-md bg-primary px-5 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
          >
            닉네임 변경
          </button>
        </form>
      </div>

      {/* Password change */}
      <div className="rounded-xl border border-border bg-white p-6 space-y-5" id="password">
        <h2 className="text-sm font-semibold text-foreground">비밀번호 변경</h2>

        <form action={updatePassword} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="current_password">현재 비밀번호</Label>
            <Input id="current_password" name="current_password" type="password" required placeholder="현재 비밀번호" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new_password">새 비밀번호</Label>
            <Input id="new_password" name="new_password" type="password" required minLength={6} placeholder="6자 이상" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm_password">새 비밀번호 확인</Label>
            <Input id="confirm_password" name="confirm_password" type="password" required placeholder="새 비밀번호 다시 입력" />
          </div>
          <button
            type="submit"
            className="inline-flex items-center justify-center rounded-md bg-primary px-5 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
          >
            비밀번호 변경
          </button>
        </form>
      </div>
    </div>
  );
}
