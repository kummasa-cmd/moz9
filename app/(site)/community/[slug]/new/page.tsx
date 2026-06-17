import { notFound, redirect } from "next/navigation";
import { ChevronLeft, Send } from "lucide-react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/server";
import { createPost } from "../actions";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string }>;
};

export default async function CommunityNewPostPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { error } = await searchParams;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/community/${slug}/new`);

  const { data: board } = await supabase
    .from("boards")
    .select("id, name, allow_user_write, type")
    .eq("slug", slug)
    .eq("is_visible", true)
    .maybeSingle();

  if (!board || !board.allow_user_write) notFound();

  const action = createPost.bind(null, slug);

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <Link
        href={`/community/${slug}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
      >
        <ChevronLeft size={14} />
        {board.name}
      </Link>

      <h1 className="text-xl font-bold text-foreground mb-6">글쓰기</h1>

      <form action={action} className="rounded-xl border border-border bg-white p-6 space-y-5">
        <div className="space-y-2">
          <Label htmlFor="title">
            제목 <span className="text-destructive">*</span>
          </Label>
          <Input id="title" name="title" required placeholder="제목을 입력하세요" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="content">
            내용 <span className="text-destructive">*</span>
          </Label>
          <Textarea
            id="content"
            name="content"
            rows={12}
            required
            placeholder="내용을 입력하세요"
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
            등록하기
          </button>
          <Link
            href={`/community/${slug}`}
            className="inline-flex items-center justify-center rounded-md border border-border px-5 py-2.5 text-sm text-muted-foreground hover:bg-muted transition-colors"
          >
            취소
          </Link>
        </div>
      </form>
    </div>
  );
}
