"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const faqs = [
  {
    q: "정말 코딩이나 디자인 지식이 없어도 되나요?",
    a: "네. 모든 기술적인 부분은 모즈나인이 대신 처리합니다.\n작가님은 콘텐츠 내용만 전달해 주시면 됩니다.",
  },
  {
    q: "중간에 플랜을 업그레이드/다운그레이드할 수 있나요?",
    a: "가능합니다. 업그레이드는 즉시 적용되며,\n다운그레이드는 다음 결제 주기부터 적용됩니다.",
  },
  {
    q: "해지하고 싶으면 어떻게 하나요?",
    a: "1개월 사전 통보 후 해지 가능합니다.\n데이터는 해지 후 30일간 보관 후 안전하게 삭제됩니다.\n(최소 이용 기간: BASIC 3개월 / STANDARD·PREMIUM 6개월)",
  },
  {
    q: "수정 횟수를 초과하면 어떻게 되나요?",
    a: "시간당 5~6만원으로 추가 작업 가능합니다.\n사전에 견적을 알려드린 후 진행합니다.",
  },
  {
    q: "결제 연동은 어떻게 진행되나요?",
    a: "STANDARD는 PG 셋업비 10만원이 별도이며,\nPREMIUM은 결제 연동이 기본 포함되어 있습니다.\nPG사 수수료는 결제 건별로 별도입니다.",
  },
  {
    q: "작가가 아닌 일반 1인 사업자도 가능한가요?",
    a: "물론입니다. 강사, 코치, 컨설턴트, 인플루언서 등\n1인 지식 사업자라면 누구나 가능합니다.",
  },
  {
    q: "기존 홈페이지를 이전할 수도 있나요?",
    a: "네. 마이그레이션 비용은 별도 견적이며,\n기존 콘텐츠와 도메인을 그대로 옮겨드립니다.",
  },
];

export default function FaqSection() {
  return (
    <section className="mt-16">
      <h2 className="text-2xl font-bold text-foreground mb-6">자주 묻는 질문</h2>
      <div className="rounded-xl border border-border bg-white">
        <Accordion defaultValue={[]} className="divide-y divide-border">
          {faqs.map((faq, i) => (
            <AccordionItem key={i} value={`faq-${i}`} className="border-none">
              <AccordionTrigger className="px-6 py-5 text-sm font-medium text-foreground hover:no-underline hover:text-primary transition-colors">
                {faq.q}
              </AccordionTrigger>
              <AccordionContent className="px-6 pb-5 text-sm text-muted-foreground whitespace-pre-line leading-relaxed">
                {faq.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
