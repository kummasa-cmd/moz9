import { Save } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { FormSelect } from "@/components/admin/FormSelect";
import PageHeader from "@/components/admin/PageHeader";
import { createProduct } from "../actions";

type NewProductPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function AdminProductNewPage({ searchParams }: NewProductPageProps) {
  const { error } = await searchParams;

  return (
    <div className="max-w-2xl">
      <PageHeader title="상품등록" description="새 상품 정보를 입력해 주세요." />

      <form action={createProduct} className="rounded-xl border border-border bg-white p-6 space-y-6">
        <div className="space-y-2">
          <Label htmlFor="name">
            상품명 <span className="text-destructive">*</span>
          </Label>
          <Input id="name" name="name" required placeholder="스탠다드 패키지" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="type">구분</Label>
            <FormSelect id="type" name="type" defaultValue="패키지">
              <option value="패키지">패키지</option>
              <option value="애드온 (일회성)">애드온 (일회성)</option>
              <option value="애드온 (월 구독)">애드온 (월 구독)</option>
              <option value="애드온 (프로젝트형)">애드온 (프로젝트형)</option>
            </FormSelect>
          </div>

          <div className="space-y-2">
            <Label htmlFor="status">판매 상태</Label>
            <FormSelect id="status" name="status" defaultValue="판매중">
              <option value="판매중">판매중</option>
              <option value="숨김">숨김</option>
            </FormSelect>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="setupFee">구축비 / 단가</Label>
            <Input id="setupFee" name="setupFee" placeholder="800,000원" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="monthlyFee">월 운영비 (해당 시)</Label>
            <Input id="monthlyFee" name="monthlyFee" placeholder="190,000원" />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">
            설명 <span className="text-destructive">*</span>
          </Label>
          <Textarea
            id="description"
            name="description"
            rows={5}
            required
            placeholder="상품 구성 및 안내 내용을 입력해 주세요"
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <button
          type="submit"
          className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
        >
          <Save size={15} />
          상품 등록
        </button>
      </form>
    </div>
  );
}
