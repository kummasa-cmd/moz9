import type { Metadata } from "next";
import Link from "next/link";
import VerifyEmailForm from "./VerifyEmailForm";

export const metadata: Metadata = { title: "이메일 확인 | 모즈나인" };

export default function VerifyEmailPage() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-foreground">이메일 확인</h1>
          <p className="text-sm text-muted-foreground mt-2">
            가입 시 등록한 이름과 전화번호로 이메일 주소를 확인할 수 있습니다.
          </p>
        </div>

        <VerifyEmailForm />

        <p className="text-center text-sm text-muted-foreground mt-4">
          <Link href="/login" className="text-primary hover:underline font-medium">
            로그인으로 돌아가기
          </Link>
        </p>
      </div>
    </div>
  );
}
