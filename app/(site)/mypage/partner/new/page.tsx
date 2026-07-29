import Link from "next/link";
import { ChevronLeft, Send } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import RichEditor from "@/components/RichEditor";
import { createPartnerPost } from "../actions";

type Props = {
  searchParams: Promise<{ error?: string }>;
};

export default async function NewPartnerPostPage({ searchParams }: Props) {
  const { error } = await searchParams;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link href="/mypage/partner" className="text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft size={18} />
        </Link>
        <h1 className="text-lg font-bold text-foreground">거래처 문의 등록</h1>
      </div>

      <form action={createPartnerPost} className="rounded-xl border border-border bg-white p-6 space-y-5">
        <div className="space-y-2">
          <Label htmlFor="title">
            제목 <span className="text-destructive">*</span>
          </Label>
          <Input id="title" name="title" required placeholder="문의 제목을 입력하세요" />
        </div>

        <div className="space-y-2">
          <Label>
            내용 <span className="text-destructive">*</span>
          </Label>
          <RichEditor name="content" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="attachment">
            첨부파일
            <span className="ml-2 text-xs text-muted-foreground font-normal">최대 10MB</span>
          </Label>
          <Input
            id="attachment"
            name="attachment"
            type="file"
            accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.hwp,.zip,.txt,.csv,.jpg,.jpeg,.png,.gif,.webp"
            className="cursor-pointer"
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <button
          type="submit"
          className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
        >
          <Send size={14} />
          등록
        </button>
      </form>
    </div>
  );
}
