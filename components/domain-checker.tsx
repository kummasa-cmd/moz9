"use client";

import { useState } from "react";
import { CheckCircle2, ExternalLink, Loader2, XCircle } from "lucide-react";
import { Input } from "@/components/ui/input";

type Tld = "kr" | "co.kr" | "com";
type Result =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "available"; domain: string }
  | { status: "registered"; domain: string }
  | { status: "unknown"; domain: string }
  | { status: "error"; message: string };

const TLD_OPTIONS: { value: Tld; label: string }[] = [
  { value: "com", label: ".com" },
  { value: "kr", label: ".kr" },
  { value: "co.kr", label: ".co.kr" },
];

export function DomainChecker() {
  const [name, setName] = useState("");
  const [tld, setTld] = useState<Tld>("com");
  const [result, setResult] = useState<Result>({ status: "idle" });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || result.status === "loading") return;

    setResult({ status: "loading" });
    try {
      const res = await fetch(
        `/api/domain-check?name=${encodeURIComponent(trimmed)}&tld=${tld}`,
      );
      const data = await res.json();

      if (!res.ok) {
        setResult({ status: "error", message: data.error ?? "조회에 실패했어요." });
        return;
      }

      setResult({ status: data.availability, domain: data.domain });
    } catch {
      setResult({ status: "error", message: "네트워크 오류가 발생했어요." });
    }
  };

  return (
    <div>
      <form onSubmit={handleSubmit} className="flex flex-col gap-2 sm:flex-row">
        <div className="flex flex-1 flex-wrap items-stretch gap-2">
          <Input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setResult({ status: "idle" });
            }}
            placeholder="원하는 도메인"
            className="h-10 min-w-[120px] flex-1"
            maxLength={63}
          />
          <div className="flex rounded-lg border border-input p-0.5">
            {TLD_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  setTld(opt.value);
                  setResult({ status: "idle" });
                }}
                className={`rounded-md px-3 text-sm font-medium transition-colors ${
                  tld === opt.value
                    ? "bg-primary text-white"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <button
          type="submit"
          disabled={!name.trim() || result.status === "loading"}
          className="inline-flex items-center justify-center gap-1.5 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {result.status === "loading" ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            "확인하기"
          )}
        </button>
      </form>

      <div className="mt-3 min-h-[1.5rem]">
        {result.status === "available" && (
          <p className="flex items-center gap-1.5 text-sm font-medium text-primary">
            <CheckCircle2 size={15} />
            {result.domain} 사용 가능해요!
          </p>
        )}
        {result.status === "registered" && (
          <p className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
            <XCircle size={15} />
            {result.domain} 이미 등록되어 있어요.
          </p>
        )}
        {result.status === "unknown" && (
          <p className="text-sm text-muted-foreground">
            결과를 확실히 판별하지 못했어요. 아래 링크에서 직접 확인해 주세요.
          </p>
        )}
        {result.status === "error" && (
          <p className="text-sm text-destructive">{result.message}</p>
        )}
      </div>

      <p className="mt-4 text-xs text-muted-foreground/80 leading-relaxed">
        가격은 등록대행사별로 다르며, .kr·co.kr은 통상 연 20,000~25,000원, .com은 통상 연
        15,000~20,000원 수준입니다(VAT 별도). 실제 구매는 상담을 통해 진행하거나 아래 등록
        대행업체에서 직접 하실 수 있어요.
      </p>
      <a
        href="https://domain.whois.co.kr/regist/dom.php"
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
      >
        후이즈에서 직접 확인·구매하기 <ExternalLink size={12} />
      </a>
    </div>
  );
}
