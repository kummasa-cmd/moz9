import PageHeader from "@/components/admin/PageHeader";
import { createAdminClient } from "@/lib/supabase/admin";
import { deleteMember, deleteMembers } from "./actions";
import MembersTable from "./MembersTable";
import { PAGE_SIZE_OPTIONS, type MemberRow } from "./types";

const DEFAULT_PAGE_SIZE = 10;

type Props = {
  searchParams: Promise<{ page?: string; limit?: string }>;
};

export default async function AdminMembersPage({ searchParams }: Props) {
  const sp = await searchParams;

  const limit = PAGE_SIZE_OPTIONS.includes(Number(sp.limit))
    ? Number(sp.limit)
    : DEFAULT_PAGE_SIZE;
  const page = Math.max(1, Number(sp.page) || 1);
  const offset = (page - 1) * limit;

  const supabase = createAdminClient();
  const { data: members, error, count } = await supabase
    .from("members")
    .select("id, name, nickname, email, phone, grade, status, is_partner, created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / limit));

  const rows: MemberRow[] = (members ?? []).map((m) => ({
    id: m.id,
    name: m.name,
    nickname: m.nickname,
    email: m.email,
    phone: m.phone,
    grade: m.grade,
    status: m.status,
    isPartner: m.is_partner,
    createdAt: m.created_at,
  }));

  return (
    <div>
      <PageHeader
        title="회원목록"
        description={`전체 ${totalCount}명의 회원이 등록되어 있습니다.`}
        actionHref="/admin/members/new"
        actionLabel="회원등록"
      />

      {error && (
        <p className="text-sm text-destructive mb-4">회원 목록을 불러오지 못했습니다: {error.message}</p>
      )}

      <MembersTable
        members={rows}
        page={page}
        limit={limit}
        totalPages={totalPages}
        deleteMemberAction={deleteMember}
        deleteMembersAction={deleteMembers}
      />
    </div>
  );
}
