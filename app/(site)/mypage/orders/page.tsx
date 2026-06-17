import { ShoppingBag } from "lucide-react";

export default function OrdersPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-foreground">주문 내역</h1>
      <div className="rounded-xl border border-border bg-white flex flex-col items-center justify-center py-20 text-muted-foreground">
        <ShoppingBag size={40} className="mb-3 opacity-30" />
        <p className="text-sm">주문 내역이 없습니다.</p>
        <p className="text-xs mt-1 opacity-70">서비스 이용 후 주문 내역이 표시됩니다.</p>
      </div>
    </div>
  );
}
