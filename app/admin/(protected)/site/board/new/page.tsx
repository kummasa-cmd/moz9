import PageHeader from "@/components/admin/PageHeader";
import BoardForm from "@/components/admin/BoardForm";
import { createBoard } from "../actions";

type NewBoardPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function AdminSiteBoardNewPage({ searchParams }: NewBoardPageProps) {
  const { error } = await searchParams;

  return (
    <div className="max-w-2xl">
      <PageHeader title="게시판 추가" description="새 게시판 정보를 입력해 주세요." />
      <BoardForm action={createBoard} error={error} submitLabel="게시판 등록" />
    </div>
  );
}
