import { notFound } from "next/navigation";
import { Save } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormSelect } from "@/components/admin/FormSelect";
import PageHeader from "@/components/admin/PageHeader";
import VendorManagerSearch from "@/components/admin/VendorManagerSearch";
import { createAdminClient } from "@/lib/supabase/admin";
import { updateVendor } from "../../actions";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
};

export default async function AdminVendorEditPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { error } = await searchParams;

  const supabase = createAdminClient();
  const { data: vendor } = await supabase
    .from("vendors")
    .select(
      "id, company_name, ceo_name, phone, email, business_reg_no, address, homepage, manager_member_id, manager_name, manager_phone, manager_email, is_active, created_at, updated_at"
    )
    .eq("id", id)
    .maybeSingle();

  if (!vendor) notFound();

  const action = updateVendor.bind(null, id);
  const defaultManager = vendor.manager_member_id
    ? {
        id: vendor.manager_member_id,
        name: vendor.manager_name ?? "",
        phone: vendor.manager_phone,
        email: vendor.manager_email ?? "",
      }
    : null;

  return (
    <div className="max-w-2xl">
      <PageHeader title="거래처 수정" description="거래처 정보를 수정해 주세요." />

      <form action={action} className="rounded-xl border border-border bg-white p-6 space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="company_name">
              회사명 <span className="text-destructive">*</span>
            </Label>
            <Input id="company_name" name="company_name" required defaultValue={vendor.company_name} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ceo_name">대표이름</Label>
            <Input id="ceo_name" name="ceo_name" defaultValue={vendor.ceo_name ?? ""} />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="phone">연락처</Label>
            <Input id="phone" name="phone" type="tel" defaultValue={vendor.phone ?? ""} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">이메일</Label>
            <Input id="email" name="email" type="email" defaultValue={vendor.email ?? ""} />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="business_reg_no">사업자등록번호</Label>
            <Input id="business_reg_no" name="business_reg_no" defaultValue={vendor.business_reg_no ?? ""} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="homepage">홈페이지 주소</Label>
            <Input id="homepage" name="homepage" type="url" defaultValue={vendor.homepage ?? ""} />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="address">회사주소</Label>
          <Input id="address" name="address" defaultValue={vendor.address ?? ""} />
        </div>

        <VendorManagerSearch defaultManager={defaultManager} />

        <div className="space-y-2">
          <Label htmlFor="is_active">활성여부</Label>
          <FormSelect id="is_active" name="is_active" defaultValue={vendor.is_active ? "Y" : "N"}>
            <option value="Y">Y</option>
            <option value="N">N</option>
          </FormSelect>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-sm text-muted-foreground">
          <div className="space-y-1">
            <Label className="text-muted-foreground">등록일</Label>
            <p>{new Date(vendor.created_at).toLocaleString("ko-KR")}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-muted-foreground">수정일</Label>
            <p>{new Date(vendor.updated_at).toLocaleString("ko-KR")}</p>
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <button
          type="submit"
          className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
        >
          <Save size={15} />
          저장
        </button>
      </form>
    </div>
  );
}
