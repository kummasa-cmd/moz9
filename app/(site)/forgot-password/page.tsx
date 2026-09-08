import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestPasswordReset } from "./actions";

export const metadata: Metadata = { title: "비밀번호 찾기 | 모즈나인" };

type Props = {
  searchParams: Promise<{ error?: string; sent?: string }>;
};

export default async function ForgotPasswordPage({ searchParams }: Props) {
  const { error, sent } = await searchParams;

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-foreground">비밀번호 찾기</h1>
          <p className="text-sm text-muted-foreground mt-2">
            가입하신 이메일로 비밀번호 재설정 링크를 보내드립니다.
          </p>
        </div>

        {sent ? (
          <div className="rounded-xl border border-border bg-white p-6 text-center">
            <CheckCircle size={36} className="text-primary mx-auto mb-3" />
            <p className="text-sm text-foreground font-medium">재설정 메일을 보냈습니다.</p>
            <p className="text-sm text-muted-foreground mt-2">
              메일함에서 링크를 확인하고 새 비밀번호를 설정해 주세요.
            </p>
          </div>
        ) : (
          <form
            action={requestPasswordReset}
            className="space-y-4 rounded-xl border border-border bg-white p-6"
          >
            <div className="space-y-2">
              <Label htmlFor="email">이메일</Label>
              <Input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="email@example.com"
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <button
              type="submit"
              className="w-full inline-flex items-center justify-center rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
            >
              재설정 링크 보내기
            </button>
          </form>
        )}

        <p className="text-center text-sm text-muted-foreground mt-4">
          <Link href="/login" className="text-primary hover:underline font-medium">
            로그인으로 돌아가기
          </Link>
        </p>
      </div>
    </div>
  );
}
