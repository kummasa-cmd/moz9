import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle, XCircle } from "lucide-react";
import { after } from "next/server";
import { unsubscribeByToken } from "@/lib/newsletter/queries";
import { syncSubscriberContact } from "@/lib/newsletter/contact-sync";

export const metadata: Metadata = {
  title: "뉴스레터 수신거부 | 모즈나인",
};

type Props = {
  searchParams: Promise<{ token?: string }>;
};

export default async function NewsletterUnsubscribePage({ searchParams }: Props) {
  const { token } = await searchParams;
  const result = token
    ? await unsubscribeByToken(token)
    : { ok: false as const, error: "잘못된 접근입니다." };

  // The UNSUBSCRIBED status and suppression entry are already saved; mirror
  // them to the Resend Contact afterwards. A Resend failure is recorded on
  // the row for retry and never undoes the unsubscribe.
  if (result.ok && result.subscriberId) {
    const subscriberId = result.subscriberId;
    after(() => syncSubscriberContact(subscriberId));
  }

  return (
    <div className="max-w-lg mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-28 text-center">
      {result.ok ? (
        <>
          <CheckCircle size={40} className="text-primary mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-foreground mb-3">수신거부 처리되었습니다</h1>
          <p className="text-muted-foreground text-sm">
            {result.email} 주소로는 더 이상 뉴스레터가 발송되지 않습니다.
          </p>
        </>
      ) : (
        <>
          <XCircle size={40} className="text-destructive mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-foreground mb-3">처리할 수 없습니다</h1>
          <p className="text-muted-foreground text-sm">{result.error}</p>
        </>
      )}

      <Link href="/" className="inline-block mt-8 text-sm text-primary hover:underline">
        홈으로 돌아가기
      </Link>
    </div>
  );
}
