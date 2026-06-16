import PageHeader from "@/components/admin/PageHeader";
import BoardPostForm from "@/components/admin/BoardPostForm";
import { createPost } from "../actions";

type NewPostPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function AdminSiteBoardNewPage({ searchParams }: NewPostPageProps) {
  const { error } = await searchParams;

  return (
    <div>
      <PageHeader title="새 글 작성" description="공지사항·자주 묻는 질문 게시물을 등록합니다." />
      <BoardPostForm action={createPost} error={error} submitLabel="글 등록" />
    </div>
  );
}
