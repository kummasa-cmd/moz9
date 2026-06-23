"use client";

import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { AlertTriangle } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { withdrawMember } from "./actions";

export default function WithdrawPage() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-bold text-foreground">회원탈퇴</h1>

      {error && (
        <p className="text-sm text-destructive bg-destructive/5 rounded-lg px-4 py-3">
          {error}
        </p>
      )}

      <div className="rounded-xl border border-border bg-white p-6 space-y-6">
        <div className="flex items-start gap-3 rounded-lg bg-amber-50 border border-amber-200 p-4">
          <AlertTriangle size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800 space-y-1">
            <p className="font-semibold">탈퇴 전 꼭 확인해 주세요</p>
            <ul className="list-disc list-inside space-y-0.5 text-amber-700">
              <li>탈퇴 시 모든 활동 정보(게시글, 댓글, 상담 내역 등)가 삭제됩니다.</li>
              <li>삭제된 정보는 복구할 수 없습니다.</li>
              <li>동일한 이메일로 재가입은 가능합니다.</li>
            </ul>
          </div>
        </div>

        <form
          action={withdrawMember}
          onSubmit={(e) => {
            if (!confirming) {
              e.preventDefault();
              const ok = window.confirm(
                "탈퇴를 하면 모든 활동 정보가 사라집니다. 정말로 탈퇴하시겠습니까?"
              );
              if (ok) {
                setConfirming(true);
                e.currentTarget.requestSubmit();
              }
            }
          }}
          className="space-y-5"
        >
          <div className="space-y-2">
            <Label htmlFor="reason">탈퇴 사유 (선택)</Label>
            <Textarea
              id="reason"
              name="reason"
              rows={4}
              placeholder="탈퇴 사유를 입력해 주시면 서비스 개선에 참고하겠습니다."
              className="resize-none"
            />
          </div>

          <button
            type="submit"
            disabled={confirming}
            className="inline-flex items-center justify-center rounded-md bg-destructive px-5 py-2.5 text-sm font-medium text-white hover:bg-destructive/90 transition-colors disabled:opacity-50"
          >
            {confirming ? "탈퇴 처리 중..." : "회원 탈퇴"}
          </button>
        </form>
      </div>
    </div>
  );
}
