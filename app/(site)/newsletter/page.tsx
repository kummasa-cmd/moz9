import type { Metadata } from "next";
import Link from "next/link";
import { Mail } from "lucide-react";
import { getPublishedNewsletters } from "@/lib/newsletter/queries";

export const metadata: Metadata = {
  title: "뉴스레터 | 모즈나인",
  description: "모즈나인이 보내는 뉴스레터 아카이브",
};

export default async function NewsletterArchivePage() {
  const newsletters = await getPublishedNewsletters();

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
      <div className="mb-12 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6">
        <div className="max-w-2xl">
          <p className="text-sm font-medium text-accent uppercase tracking-widest mb-3">
            Newsletter
          </p>
          <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">뉴스레터</h1>
          <p className="text-muted-foreground leading-relaxed">
            모즈나인이 보내는 소식을 이메일로 받아보세요.
          </p>
        </div>
        <Link
          href="/newsletter/subscribe"
          className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-white hover:bg-primary/90 transition-colors shrink-0"
        >
          <Mail size={15} />
          구독하기
        </Link>
      </div>

      {newsletters.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {newsletters.map((n) => (
            <Link
              key={n.id}
              href={`/newsletter/${n.slug}`}
              className="rounded-xl border border-border bg-white overflow-hidden hover:shadow-md transition-shadow group"
            >
              <div className="h-40 overflow-hidden bg-gradient-to-br from-blue-100 via-blue-50 to-violet-50">
                {n.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={n.thumbnailUrl}
                    alt={n.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Mail size={32} className="text-primary/20" />
                  </div>
                )}
              </div>
              <div className="p-5">
                <p className="text-xs text-muted-foreground mb-1">
                  {n.publishedAt ? new Date(n.publishedAt).toLocaleDateString("ko-KR") : ""}
                </p>
                <h2 className="font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-2">
                  {n.title}
                </h2>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground text-sm py-20 text-center">
          아직 발행된 뉴스레터가 없습니다.
        </p>
      )}
    </div>
  );
}
