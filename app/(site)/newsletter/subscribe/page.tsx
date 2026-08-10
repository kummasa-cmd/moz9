import type { Metadata } from "next";
import { Mail } from "lucide-react";
import { SubscribeForm } from "@/components/newsletter/SubscribeForm";

export const metadata: Metadata = {
  title: "뉴스레터 구독 | 모즈나인",
  description: "모즈나인 뉴스레터를 이메일로 받아보세요.",
};

export default function NewsletterSubscribePage() {
  return (
    <div className="max-w-lg mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
      <div className="text-center mb-10">
        <div className="mx-auto mb-4 inline-flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Mail size={22} />
        </div>
        <p className="text-sm font-medium text-accent uppercase tracking-widest mb-3">Newsletter</p>
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-3">뉴스레터 구독하기</h1>
        <p className="text-muted-foreground leading-relaxed">
          모즈나인의 새 소식과 인사이트를 이메일로 받아보세요.
        </p>
      </div>

      <SubscribeForm />
    </div>
  );
}
