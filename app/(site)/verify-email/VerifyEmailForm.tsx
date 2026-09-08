"use client";

import { useActionState } from "react";
import { CheckCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { findMemberEmail, type FindEmailState } from "./actions";

const initialState: FindEmailState = {};

export default function VerifyEmailForm() {
  const [state, formAction, isPending] = useActionState(findMemberEmail, initialState);

  return (
    <div className="space-y-4">
      {state.email && (
        <div className="rounded-xl border border-border bg-white p-6 text-center">
          <CheckCircle size={36} className="text-primary mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">가입하신 이메일 주소는 다음과 같습니다.</p>
          <p className="text-base font-semibold text-foreground mt-2">{state.email}</p>
        </div>
      )}

      <form action={formAction} className="space-y-4 rounded-xl border border-border bg-white p-6">
        <div className="space-y-2">
          <Label htmlFor="name">이름</Label>
          <Input id="name" name="name" required placeholder="가입 시 등록한 이름" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="phone">전화번호</Label>
          <Input id="phone" name="phone" type="tel" required placeholder="010-1234-5678" />
        </div>

        {state.error && <p className="text-sm text-destructive">{state.error}</p>}

        <button
          type="submit"
          disabled={isPending}
          className="w-full inline-flex items-center justify-center rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary/90 transition-colors disabled:opacity-60"
        >
          {isPending ? "확인 중..." : "이메일 확인"}
        </button>
      </form>
    </div>
  );
}
