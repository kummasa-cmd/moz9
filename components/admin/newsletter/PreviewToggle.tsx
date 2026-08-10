"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PreviewToggle({ web, emailHtml }: { web: ReactNode; emailHtml: string }) {
  const [tab, setTab] = useState<"web" | "email">("web");

  return (
    <div>
      <div className="flex gap-2 mb-4">
        <button
          type="button"
          onClick={() => setTab("web")}
          className={cn(
            "rounded-md px-4 py-2 text-sm font-medium transition-colors",
            tab === "web" ? "bg-primary text-white" : "border border-border text-muted-foreground hover:bg-muted",
          )}
        >
          웹 미리보기
        </button>
        <button
          type="button"
          onClick={() => setTab("email")}
          className={cn(
            "rounded-md px-4 py-2 text-sm font-medium transition-colors",
            tab === "email" ? "bg-primary text-white" : "border border-border text-muted-foreground hover:bg-muted",
          )}
        >
          이메일 미리보기
        </button>
      </div>

      {tab === "web" ? (
        <div className="rounded-xl border border-border bg-white p-8 max-w-2xl mx-auto">{web}</div>
      ) : (
        <iframe
          srcDoc={emailHtml}
          title="이메일 미리보기"
          className="w-full h-[800px] rounded-xl border border-border bg-white"
        />
      )}
    </div>
  );
}
