import { notFound } from "next/navigation";
import { Save } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { FormSelect } from "@/components/admin/FormSelect";
import PageHeader from "@/components/admin/PageHeader";
import { createClient } from "@/lib/supabase/server";
import { updateMember } from "../../actions";

type EditMemberPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
};

export default async function AdminMemberEditPage({ params, searchParams }: EditMemberPageProps) {
  const { id } = await params;
  const { error } = await searchParams;

  const supabase = await createClient();
  const { data: member } = await supabase
    .from("members")
    .select("id, name, email, phone, grade, status, memo")
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="name">
              이름 <span className="text-destructive">*</span>
            </Label>
            <Input id="name" name="name" required defaultValue={member.name} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">
              이메일 <span className="text-destructive">*</span>
            </Label>
            <Input id="email" name="email" type="email" required defaultValue={member.email} />
          </div>
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
