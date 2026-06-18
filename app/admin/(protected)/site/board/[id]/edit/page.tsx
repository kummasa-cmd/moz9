import { notFound } from "next/navigation";
import PageHeader from "@/components/admin/PageHeader";
import BoardForm from "@/components/admin/BoardForm";
import { createAdminClient } from "@/lib/supabase/admin";
import { updateBoard } from "../../actions";

type EditBoardPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
};

export default async function AdminSiteBoardEditPage({ params, searchParams }: EditBoardPageProps) {
  const { id } = await params;
  const { error } = await searchParams;

  const supabase = createAdminClient();
  const { data: board } = await supabase
    .from("boards")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!board) notFound();

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="게시판 수정"
        description={`"${board.name}" 게시판 설정을 수정합니다.`}
      />
      <BoardForm
        action={updateBoard.bind(null, board.id)}
        defaultValues={board}
        error={error}
        submitLabel="수정 완료"
      />
    </div>
  );
}
