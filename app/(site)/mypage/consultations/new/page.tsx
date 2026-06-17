import Link from "next/link";
import { ChevronLeft, Send } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createConsultation } from "../actions";

type Props = {
  searchParams: Promise<{ error?: string }>;
};

export default async function NewConsultationPage({ searchParams }: Props) {
  const { error } = await searchParams;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link href="/mypage/consultations" className="text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft size={18} />
        </Link>
        <h1 className="text-lg font-bold text-foreground">상담 신청</h1>
      </div>

      <form action={createConsultation} className="rounded-xl border border-border bg-white p-6 space-y-5">
        <div className="space-y-2">
          <Label htmlFor="subject">
            상담 제목 <span className="text-destructive">*</span>
          </Label>
          <Input id="subject" name="subject" required placeholder="상담하실 내용의 제목을 입력하세요" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="message">
            상담 내용 <span className="text-destructive">*</span>
          </Label>
          <Textarea
            id="message"
            name="message"
            rows={8}
            required
            placeholder="궁금하신 내용을 자세히 작성해 주세요."
            className="resize-y"
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
          >
            <Send size={14} />
            상담 신청
          </button>
          <Link
            href="/mypage/consultations"
            className="inline-flex items-center justify-center rounded-md border border-border px-5 py-2.5 text-sm text-muted-foreground hover:bg-muted transition-colors"
          >
            취소
          </Link>
        </div>
      </form>
    </div>
  );
}
