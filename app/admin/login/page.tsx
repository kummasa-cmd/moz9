import type { Metadata } from "next";
import { LogIn } from "lucide-react";
import { login } from "./actions";

export const metadata: Metadata = {
  title: "관리자 로그인 | 모즈나인",
  robots: { index: false, follow: false },
};

type LoginPageProps = {
  searchParams: Promise<{ error?: string; redirect?: string }>;
};

export default async function AdminLoginPage({ searchParams }: LoginPageProps) {
  const { error, redirect: redirectTo } = await searchParams;

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0F172A] px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <p className="font-bold text-2xl text-white tracking-tight">
            moz9 <span className="text-white/50 font-normal text-base">admin</span>
          </p>
        </div>

        <form action={login} className="rounded-xl bg-white p-6 space-y-5">
          <input type="hidden" name="redirect" value={redirectTo || "/admin"} />

          <div className="space-y-2">
            <label htmlFor="email" className="text-sm font-medium text-foreground">
              이메일
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              placeholder="admin@example.com"
              className="h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="password" className="text-sm font-medium text-foreground">
              비밀번호
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              placeholder="••••••••"
              className="h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <button
            type="submit"
            className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary/90 transition-colors w-full"
          >
            <LogIn size={15} />
            로그인
          </button>
        </form>
      </div>
    </div>
  );
}
