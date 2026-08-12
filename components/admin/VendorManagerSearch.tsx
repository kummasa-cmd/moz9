"use client";

import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { searchPartnerMembers, type PartnerMemberResult } from "@/app/admin/(protected)/orders/vendors/actions";

type Props = {
  defaultManager?: PartnerMemberResult | null;
};

export default function VendorManagerSearch({ defaultManager = null }: Props) {
  const [selected, setSelected] = useState<PartnerMemberResult | null>(defaultManager);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PartnerMemberResult[]>([]);
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
      const data = await searchPartnerMembers(query);
      setResults(data);
      setLoading(false);
      setOpen(true);
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  function handleSelect(member: PartnerMemberResult) {
    setSelected(member);
    setQuery("");
    setResults([]);
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="space-y-2">
      <Label>
        관리자명 <span className="text-destructive">*</span>
      </Label>

      <input type="hidden" name="manager_member_id" value={selected?.id ?? ""} />
      <input type="hidden" name="manager_name" value={selected?.name ?? ""} />
      <input type="hidden" name="manager_phone" value={selected?.phone ?? ""} />
      <input type="hidden" name="manager_email" value={selected?.email ?? ""} />

      {selected ? (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-input px-3 py-2 text-sm">
          <div>
            <p className="font-medium text-foreground">{selected.name}</p>
            <p className="text-xs text-muted-foreground">
              {selected.phone ?? "-"} · {selected.email}
            </p>
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
            placeholder="거래처로 체크된 회원 이름으로 검색"
            className="pl-8"
          />
          {open && (
            <div className="absolute z-10 mt-1 w-full rounded-lg border border-border bg-white shadow-lg max-h-56 overflow-y-auto">
              {loading && <p className="px-3 py-2 text-sm text-muted-foreground">검색 중...</p>}
              {!loading && results.length === 0 && (
                <p className="px-3 py-2 text-sm text-muted-foreground">
                  거래처로 체크된 회원 중 일치하는 결과가 없습니다.
                </p>
              )}
              {!loading &&
                results.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => handleSelect(m)}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-muted transition-colors"
                  >
                    <p className="font-medium text-foreground">{m.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {m.phone ?? "-"} · {m.email}
                    </p>
                  </button>
                ))}
            </div>
          )}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        회원관리에서 &apos;거래처&apos;로 체크된 회원만 검색됩니다.
      </p>
    </div>
  );
}
