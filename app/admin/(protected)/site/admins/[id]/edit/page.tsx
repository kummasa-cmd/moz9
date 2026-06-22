import { notFound } from "next/navigation";
import { Save } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormSelect } from "@/components/admin/FormSelect";
import PageHeader from "@/components/admin/PageHeader";
import { createAdminClient } from "@/lib/supabase/admin";
import { updateAdmin } from "../../actions";

type EditAdminPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
};

export default async function AdminSiteAdminEditPage({ params, searchParams }: EditAdminPageProps) {
  const { id } = await params;
  const { error } = await searchParams;

  const supabase = createAdminClient();
  const { data: admin } = await supabase
    .from("admins")
    .select("id, name, email, role")
    .eq("id", id)
    .maybeSingle();

  if (!admin) notFound();

  return (
    <div className="max-w-xl">
      <PageHeader title="관리자 수정" description={`${admin.email} 계정의 이름·권한을 수정합니다.`} />

      <form action={updateAdmin.bind(null, admin.id)} className="rounded-xl border border-border bg-white p-6 space-y-5">
        <div className="space-y-2">
          <Label htmlFor="email">이메일</Label>
          <Input id="email" value={admin.email} disabled />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="name">
              이름 <span className="text-destructive">*</span>
            </Label>
            <Input id="name" name="name" required defaultValue={admin.name} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="role">권한</Label>
            <FormSelect id="role" name="role" defaultValue={admin.role}>
              <option value="운영자">운영자</option>
              <option value="최고관리자">최고관리자</option>
            </FormSelect>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">비밀번호 변경</Label>
          <Input id="password" name="password" type="password" minLength={6} placeholder="변경 시에만 입력" />
          <p className="text-xs text-muted-foreground">비워두면 기존 비밀번호가 유지됩니다.</p>
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
