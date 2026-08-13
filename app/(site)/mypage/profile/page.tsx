import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import MemberAvatarUpload from "@/components/mypage/MemberAvatarUpload";
import { updateProfile, updatePassword, updatePartnerProfile } from "./actions";

type Props = {
  searchParams: Promise<{ error?: string; success?: string }>;
};

export default async function ProfilePage({ searchParams }: Props) {
  const { error, success } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const admin = createAdminClient();
  const { data: member } = await admin
    .from("members")
    .select(
      "nickname, email, created_at, avatar_url, bio, homepage, is_partner, partner_name, partner_homepage, partner_address, partner_phone, partner_product, partner_contract_start, partner_contract_end, partner_note, partner_active"
    )
    .eq("user_id", user!.id)
    .maybeSingle();

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-bold text-foreground">회원정보 수정</h1>

      {success === "1" && (
        <p className="text-sm text-green-600 bg-green-50 rounded-lg px-4 py-3">회원 정보가 저장되었습니다.</p>
      )}
      {success === "2" && (
        <p className="text-sm text-green-600 bg-green-50 rounded-lg px-4 py-3">비밀번호가 변경되었습니다.</p>
      )}
      {success === "3" && (
        <p className="text-sm text-green-600 bg-green-50 rounded-lg px-4 py-3">거래처 정보가 저장되었습니다.</p>
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
            <Label>프로필 사진</Label>
            <MemberAvatarUpload name="avatar_url" defaultValue={member?.avatar_url} />
          </div>

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

          <div className="space-y-2">
            <Label htmlFor="homepage">홈페이지 주소</Label>
            <Input
              id="homepage"
              name="homepage"
              type="url"
              defaultValue={member?.homepage ?? ""}
              placeholder="https://example.com"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="bio">자기소개</Label>
            <Textarea
              id="bio"
              name="bio"
              rows={5}
              defaultValue={member?.bio ?? ""}
              placeholder="자기소개를 입력하세요 (5줄 이내)"
            />
          </div>

          <button
            type="submit"
            className="inline-flex items-center justify-center rounded-md bg-primary px-5 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
          >
            기본 정보 저장
          </button>
        </form>
      </div>

      {/* Partner info (only shown to partner members) */}
      {member?.is_partner && (
        <div className="rounded-xl border border-border bg-white p-6 space-y-5">
          <h2 className="text-sm font-semibold text-foreground">거래처 정보</h2>

          <form action={updatePartnerProfile} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="partner_name">거래처명</Label>
                <Input
                  id="partner_name"
                  name="partner_name"
                  defaultValue={member.partner_name ?? ""}
                  placeholder="미입력 시 닉네임 사용"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="partner_homepage">홈페이지 주소</Label>
                <Input id="partner_homepage" name="partner_homepage" defaultValue={member.partner_homepage ?? ""} />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="partner_address">회사 주소</Label>
              <Input id="partner_address" name="partner_address" defaultValue={member.partner_address ?? ""} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="partner_phone">회사 전화번호(대표 휴대폰)</Label>
                <Input id="partner_phone" name="partner_phone" type="tel" defaultValue={member.partner_phone ?? ""} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="partner_product">이용 상품</Label>
                <select
                  id="partner_product"
                  name="partner_product"
                  defaultValue={member.partner_product ?? ""}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <option value="">선택 안함</option>
                  <option value="LIGHT">LIGHT</option>
                  <option value="BASIC">BASIC</option>
                  <option value="STANDARD">STANDARD</option>
                  <option value="PREMIUM">PREMIUM</option>
                </select>
              </div>
              <div />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="partner_contract_start">계약 시작일</Label>
                <Input
                  id="partner_contract_start"
                  name="partner_contract_start"
                  type="date"
                  defaultValue={member.partner_contract_start ?? ""}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="partner_contract_end">계약 종료일</Label>
                <Input
                  id="partner_contract_end"
                  name="partner_contract_end"
                  type="date"
                  defaultValue={member.partner_contract_end ?? ""}
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                name="partner_active"
                defaultChecked={member.partner_active}
                className="size-4 rounded border-input"
              />
              활성여부 (메인 소개 노출)
            </label>

            <div className="space-y-2">
              <Label htmlFor="partner_note">비고</Label>
              <Textarea id="partner_note" name="partner_note" rows={3} defaultValue={member.partner_note ?? ""} />
            </div>

            <button
              type="submit"
              className="inline-flex items-center justify-center rounded-md bg-primary px-5 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
            >
              거래처 정보 저장
            </button>
          </form>
        </div>
      )}

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
