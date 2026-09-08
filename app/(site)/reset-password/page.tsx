import type { Metadata } from "next";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/server";
import { resetPassword } from "./actions";

export const metadata: Metadata = { title: "비밀번호 재설정 | 모즈나인" };

type Props = {
  searchParams: Promise<{ error?: string }>;
};

export default async function ResetPasswordPage({ searchParams }: Props) {
  const { error } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-foreground">비밀번호 재설정</h1>
          <p className="text-sm text-muted-foreground mt-2">사용하실 새 비밀번호를 입력해 주세요.</p>
        </div>

        {!user ? (
          <div className="rounded-xl border border-border bg-white p-6 text-center">
            <p className="text-sm text-destructive">인증 링크가 유효하지 않거나 만료되었습니다.</p>
            <Link
              href="/forgot-password"
              className="inline-block mt-4 text-sm text-primary hover:underline font-medium"
            >
              비밀번호 재설정 다시 요청하기
            </Link>
          </div>
        ) : (
          <form
            action={resetPassword}
            className="space-y-4 rounded-xl border border-border bg-white p-6"
          >
            <div className="space-y-2">
              <Label htmlFor="password">새 비밀번호</Label>
              <Input
                id="password"
                name="password"
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                placeholder="6자 이상"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="passwordConfirm">새 비밀번호 확인</Label>
              <Input
                id="passwordConfirm"
                name="passwordConfirm"
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                placeholder="6자 이상"
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <button
              type="submit"
              className="w-full inline-flex items-center justify-center rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
            >
              비밀번호 변경하기
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
