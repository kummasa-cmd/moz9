import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft, Paperclip, Save } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import RichEditor from "@/components/RichEditor";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { updatePartnerPost } from "../../actions";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
};

export default async function EditPartnerPostPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { error } = await searchParams;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/mypage/partner/${id}/edit`);

  const admin = createAdminClient();
  const { data: post } = await admin
    .from("partner_posts")
    .select("id, title, content, member_id, attachment_url, attachment_name")
    .eq("id", id)
    .eq("member_id", user.id)
    .maybeSingle();

  if (!post) notFound();

  const action = updatePartnerPost.bind(null, id);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link href={`/mypage/partner/${id}`} className="text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft size={18} />
        </Link>
        <h1 className="text-lg font-bold text-foreground">거래처 문의 수정</h1>
      </div>

      <form action={action} className="rounded-xl border border-border bg-white p-6 space-y-5">
        <div className="space-y-2">
          <Label htmlFor="title">
            제목 <span className="text-destructive">*</span>
          </Label>
          <Input id="title" name="title" required defaultValue={post.title} placeholder="문의 제목을 입력하세요" />
        </div>

        <div className="space-y-2">
          <Label>
            내용 <span className="text-destructive">*</span>
          </Label>
          <RichEditor name="content" defaultValue={post.content} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="attachment">
            첨부파일
            <span className="ml-2 text-xs text-muted-foreground font-normal">최대 10MB, 새 파일을 선택하면 기존 파일을 대체합니다</span>
          </Label>
          {post.attachment_url && (
            <a
              href={post.attachment_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
            >
              <Paperclip size={14} />
              {post.attachment_name ?? "첨부파일"}
            </a>
          )}
          <Input
            id="attachment"
            name="attachment"
            type="file"
            accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.hwp,.zip,.txt,.csv,.jpg,.jpeg,.png,.gif,.webp"
            className="cursor-pointer"
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
          >
            <Save size={14} />
            저장
          </button>
          <Link
            href={`/mypage/partner/${id}`}
            className="inline-flex items-center justify-center rounded-md border border-border px-5 py-2.5 text-sm text-muted-foreground hover:bg-muted transition-colors"
          >
            취소
          </Link>
        </div>
      </form>
    </div>
  );
}
