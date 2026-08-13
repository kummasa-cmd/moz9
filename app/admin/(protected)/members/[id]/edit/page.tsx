import { notFound } from "next/navigation";
import { Save } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { FormSelect } from "@/components/admin/FormSelect";
import PageHeader from "@/components/admin/PageHeader";
import MemberAvatarUpload from "@/components/mypage/MemberAvatarUpload";
import { createAdminClient } from "@/lib/supabase/admin";
import { updateMember } from "../../actions";

type EditMemberPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
};

export default async function AdminMemberEditPage({ params, searchParams }: EditMemberPageProps) {
  const { id } = await params;
  const { error } = await searchParams;

  const supabase = createAdminClient();
  const { data: member } = await supabase
    .from("members")
    .select(
      "id, name, nickname, email, phone, grade, status, memo, avatar_url, bio, is_partner, partner_name, partner_homepage, partner_address, partner_phone, partner_product, partner_contract_start, partner_contract_end, partner_note, partner_active, is_column_member"
    )
    .eq("id", id)
    .maybeSingle();

  if (!member) notFound();

  return (
    <div className="max-w-2xl">
      <PageHeader title="회원 수정" description={`${member.name}님의 회원 정보를 수정합니다.`} />

      <form
        action={updateMember.bind(null, member.id)}
        className="rounded-xl border border-border bg-white p-6 space-y-6"
      >
        <div className="space-y-2">
          <Label>프로필 사진</Label>
          <MemberAvatarUpload name="avatar_url" defaultValue={member.avatar_url} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="name">
              이름 <span className="text-destructive">*</span>
            </Label>
            <Input id="name" name="name" required defaultValue={member.name} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="nickname">닉네임</Label>
            <Input id="nickname" name="nickname" defaultValue={member.nickname ?? ""} />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="bio">자기소개</Label>
          <Textarea id="bio" name="bio" rows={5} defaultValue={member.bio ?? ""} placeholder="5줄 이내" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">
            이메일 <span className="text-destructive">*</span>
          </Label>
          <Input id="email" name="email" type="email" required defaultValue={member.email} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">비밀번호 변경</Label>
          <Input id="password" name="password" type="password" minLength={6} placeholder="변경 시에만 입력 (6자 이상)" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div className="space-y-2">
            <Label htmlFor="phone">연락처</Label>
            <Input id="phone" name="phone" type="tel" defaultValue={member.phone ?? ""} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="grade">회원등급</Label>
            <FormSelect id="grade" name="grade" defaultValue={member.grade}>
              <option value="일반">일반</option>
              <option value="VIP">VIP</option>
            </FormSelect>
          </div>

          <div className="space-y-2">
            <Label htmlFor="status">상태</Label>
            <FormSelect id="status" name="status" defaultValue={member.status}>
              <option value="정상">정상</option>
              <option value="휴면">휴면</option>
              <option value="탈퇴">탈퇴</option>
            </FormSelect>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="memo">메모</Label>
          <Textarea id="memo" name="memo" rows={4} defaultValue={member.memo ?? ""} />
        </div>

        <label className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <input
            type="checkbox"
            name="is_column_member"
            defaultChecked={member.is_column_member}
            className="size-4 rounded border-input"
          />
          컬럼 회원 여부
        </label>
        <p className="text-xs text-muted-foreground -mt-3">
          체크하면 컬럼 회원 전용으로 설정된 게시판(컬럼/연재/정보/광고)에 사용자 페이지에서 접근할 수 있습니다.
        </p>

        <div className="space-y-5 rounded-lg border border-border p-5">
          <label className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <input
              type="checkbox"
              name="is_partner"
              defaultChecked={member.is_partner}
              className="size-4 rounded border-input"
            />
            거래처 여부 (관리자 전용)
          </label>
          <p className="text-xs text-muted-foreground -mt-3">
            체크하면 마이페이지 회원정보 수정에서 아래 거래처 정보 항목이 활성화됩니다.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="partner_name">거래처명</Label>
              <Input
                id="partner_name"
                name="partner_name"
                defaultValue={member.partner_name ?? ""}
                placeholder="미입력 시 닉네임/이름 사용"
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

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div className="space-y-2">
              <Label htmlFor="partner_phone">회사 전화번호(대표 휴대폰)</Label>
              <Input id="partner_phone" name="partner_phone" type="tel" defaultValue={member.partner_phone ?? ""} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="partner_product">이용 상품</Label>
              <FormSelect id="partner_product" name="partner_product" defaultValue={member.partner_product ?? ""}>
                <option value="">선택 안함</option>
                <option value="LIGHT">LIGHT</option>
                <option value="BASIC">BASIC</option>
                <option value="STANDARD">STANDARD</option>
                <option value="PREMIUM">PREMIUM</option>
              </FormSelect>
            </div>
            <div />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
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
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <button
          type="submit"
          className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
        >
          <Save size={15} />
          수정 완료
        </button>
      </form>
    </div>
  );
}
