import { Save } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { FormSelect } from "@/components/admin/FormSelect";
import PageHeader from "@/components/admin/PageHeader";
import { createMember } from "../actions";

type NewMemberPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function AdminMemberNewPage({ searchParams }: NewMemberPageProps) {
  const { error } = await searchParams;

  return (
    <div className="max-w-2xl">
      <PageHeader title="회원등록" description="새 회원 정보를 입력해 주세요." />

      <form action={createMember} className="rounded-xl border border-border bg-white p-6 space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="name">
              이름 <span className="text-destructive">*</span>
            </Label>
            <Input id="name" name="name" required placeholder="홍길동" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="nickname">닉네임</Label>
            <Input id="nickname" name="nickname" placeholder="커뮤니티 닉네임" />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">
            이메일 <span className="text-destructive">*</span>
          </Label>
          <Input id="email" name="email" type="email" required placeholder="hello@example.com" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">
            비밀번호 <span className="text-destructive">*</span>
          </Label>
          <Input id="password" name="password" type="password" required minLength={6} placeholder="6자 이상 입력" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div className="space-y-2">
            <Label htmlFor="phone">연락처</Label>
            <Input id="phone" name="phone" type="tel" placeholder="010-0000-0000" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="grade">회원등급</Label>
            <FormSelect id="grade" name="grade" defaultValue="일반">
              <option value="일반">일반</option>
              <option value="VIP">VIP</option>
            </FormSelect>
          </div>

          <div className="space-y-2">
            <Label htmlFor="status">상태</Label>
            <FormSelect id="status" name="status" defaultValue="정상">
              <option value="정상">정상</option>
              <option value="휴면">휴면</option>
              <option value="탈퇴">탈퇴</option>
            </FormSelect>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="memo">메모</Label>
          <Textarea id="memo" name="memo" rows={4} placeholder="관리자 메모" />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <button
          type="submit"
          className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
        >
          <Save size={15} />
          회원 등록
        </button>
      </form>
    </div>
  );
}
