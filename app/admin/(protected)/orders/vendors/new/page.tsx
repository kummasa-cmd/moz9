import { Save } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormSelect } from "@/components/admin/FormSelect";
import PageHeader from "@/components/admin/PageHeader";
import VendorManagerSearch from "@/components/admin/VendorManagerSearch";
import { createVendor } from "../actions";

type NewVendorPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function AdminVendorNewPage({ searchParams }: NewVendorPageProps) {
  const { error } = await searchParams;

  return (
    <div className="max-w-2xl">
      <PageHeader title="거래처 등록" description="거래처 정보를 입력해 주세요." />

      <form action={createVendor} className="rounded-xl border border-border bg-white p-6 space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="company_name">
              회사명 <span className="text-destructive">*</span>
            </Label>
            <Input id="company_name" name="company_name" required placeholder="모즈나인 주식회사" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ceo_name">대표이름</Label>
            <Input id="ceo_name" name="ceo_name" placeholder="홍길동" />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="phone">연락처</Label>
            <Input id="phone" name="phone" type="tel" placeholder="02-1234-5678" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">이메일</Label>
            <Input id="email" name="email" type="email" placeholder="contact@company.com" />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="business_reg_no">사업자등록번호</Label>
            <Input id="business_reg_no" name="business_reg_no" placeholder="123-45-67890" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="homepage">홈페이지 주소</Label>
            <Input id="homepage" name="homepage" type="url" placeholder="https://example.com" />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="address">회사주소</Label>
          <Input id="address" name="address" placeholder="서울특별시 강남구 ..." />
        </div>

        <VendorManagerSearch />

        <div className="space-y-2">
          <Label htmlFor="is_active">활성여부</Label>
          <FormSelect id="is_active" name="is_active" defaultValue="Y">
            <option value="Y">Y</option>
            <option value="N">N</option>
          </FormSelect>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <button
          type="submit"
          className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
        >
          <Save size={15} />
          거래처 등록
        </button>
      </form>
    </div>
  );
}
