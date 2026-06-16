import { Save } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { FormSelect } from "@/components/admin/FormSelect";
import PageHeader from "@/components/admin/PageHeader";
import { createOrder } from "../actions";

type NewOrderPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function AdminOrderNewPage({ searchParams }: NewOrderPageProps) {
  const { error } = await searchParams;

  return (
    <div className="max-w-2xl">
      <PageHeader title="주문등록" description="새 주문 정보를 입력해 주세요." />

      <form action={createOrder} className="rounded-xl border border-border bg-white p-6 space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="customer">
              고객명 <span className="text-destructive">*</span>
            </Label>
            <Input id="customer" name="customer" required placeholder="홍길동" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="product">
              상품 <span className="text-destructive">*</span>
            </Label>
            <Input id="product" name="product" required placeholder="스탠다드 패키지" />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="amount">
              금액 <span className="text-destructive">*</span>
            </Label>
            <Input id="amount" name="amount" required placeholder="1,200,000원" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="status">주문 상태</Label>
            <FormSelect id="status" name="status" defaultValue="결제대기">
              <option value="결제대기">결제대기</option>
              <option value="결제완료">결제완료</option>
              <option value="진행중">진행중</option>
              <option value="취소">취소</option>
            </FormSelect>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="memo">메모</Label>
          <Textarea id="memo" name="memo" rows={4} placeholder="주문 관련 메모" />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <button
          type="submit"
          className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
        >
          <Save size={15} />
          주문 등록
        </button>
      </form>
    </div>
  );
}
