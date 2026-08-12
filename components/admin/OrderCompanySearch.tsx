"use client";

import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { searchVendors, type OrderVendorResult } from "@/app/admin/(protected)/orders/actions";

type Props = {
  defaultVendor?: OrderVendorResult | null;
};

export default function OrderCompanySearch({ defaultVendor = null }: Props) {
  const [selected, setSelected] = useState<OrderVendorResult | null>(defaultVendor);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<OrderVendorResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    setLoading(true);
    const timer = setTimeout(async () => {
      const data = await searchVendors(query);
      setResults(data);
      setLoading(false);
      setOpen(true);
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  function handleSelect(vendor: OrderVendorResult) {
    setSelected(vendor);
    setQuery("");
    setResults([]);
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="space-y-2">
      <Label>
        회사명 <span className="text-destructive">*</span>
      </Label>

      <input type="hidden" name="vendor_id" value={selected?.id ?? ""} />
      <input type="hidden" name="company_name" value={selected?.company_name ?? ""} />

      {selected ? (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-input px-3 py-2 text-sm">
          <div>
            <p className="font-medium text-foreground">{selected.company_name}</p>
            {selected.ceo_name && <p className="text-xs text-muted-foreground">대표 {selected.ceo_name}</p>}
          </div>
          <button
            type="button"
            onClick={() => setSelected(null)}
            className="text-muted-foreground hover:text-destructive transition-colors"
            aria-label="선택 해제"
          >
            <X size={15} />
          </button>
        </div>
      ) : (
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => results.length > 0 && setOpen(true)}
            placeholder="거래처 회사명으로 검색"
            className="pl-8"
          />
          {open && (
            <div className="absolute z-10 mt-1 w-full rounded-lg border border-border bg-white shadow-lg max-h-56 overflow-y-auto">
              {loading && <p className="px-3 py-2 text-sm text-muted-foreground">검색 중...</p>}
              {!loading && results.length === 0 && (
                <p className="px-3 py-2 text-sm text-muted-foreground">일치하는 거래처가 없습니다.</p>
              )}
              {!loading &&
                results.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => handleSelect(v)}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-muted transition-colors"
                  >
                    <p className="font-medium text-foreground">{v.company_name}</p>
                    {v.ceo_name && <p className="text-xs text-muted-foreground">대표 {v.ceo_name}</p>}
                  </button>
                ))}
            </div>
          )}
        </div>
      )}

      <p className="text-xs text-muted-foreground">거래처목록에 등록된 활성 거래처만 검색됩니다.</p>
    </div>
  );
}
