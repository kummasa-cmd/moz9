import Link from "next/link";
import { Pencil, Trash2 } from "lucide-react";
import PageHeader from "@/components/admin/PageHeader";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createAdminClient } from "@/lib/supabase/admin";
import { deleteMember } from "./actions";

function statusVariant(status: string) {
  if (status === "정상") return "default" as const;
  if (status === "탈퇴") return "destructive" as const;
  return "secondary" as const;
}

export default async function AdminMembersPage() {
  const supabase = createAdminClient();
  const { data: members, error } = await supabase
    .from("members")
    .select("id, name, nickname, email, phone, grade, status, created_at")
    .order("created_at", { ascending: false });

  return (
    <div>
      <PageHeader
        title="회원목록"
        description={`전체 ${members?.length ?? 0}명의 회원이 등록되어 있습니다.`}
        actionHref="/admin/members/new"
        actionLabel="회원등록"
      />

      {error && (
        <p className="text-sm text-destructive mb-4">회원 목록을 불러오지 못했습니다: {error.message}</p>
      )}

      <div className="rounded-xl border border-border bg-white overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>이름</TableHead>
              <TableHead>닉네임</TableHead>
              <TableHead>이메일</TableHead>
              <TableHead>연락처</TableHead>
              <TableHead>등급</TableHead>
              <TableHead>가입일</TableHead>
              <TableHead>상태</TableHead>
              <TableHead className="text-right">관리</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(members ?? []).map((m) => (
              <TableRow key={m.id}>
                <TableCell className="font-medium">{m.name}</TableCell>
                <TableCell className="text-muted-foreground">{m.nickname ?? <span className="text-muted-foreground/40">—</span>}</TableCell>
                <TableCell className="text-muted-foreground">{m.email}</TableCell>
                <TableCell className="text-muted-foreground">{m.phone ?? "-"}</TableCell>
                <TableCell className="text-muted-foreground">{m.grade}</TableCell>
                <TableCell className="text-muted-foreground">
                  {new Date(m.created_at).toLocaleDateString("ko-KR")}
                </TableCell>
                <TableCell>
                  <Badge variant={statusVariant(m.status)}>{m.status}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="inline-flex items-center gap-3">
                    <Link
                      href={`/admin/members/${m.id}/edit`}
                      className="text-muted-foreground hover:text-primary transition-colors"
                      aria-label="수정"
                    >
                      <Pencil size={15} />
                    </Link>
                    <form action={deleteMember}>
                      <input type="hidden" name="id" value={m.id} />
                      <button
                        type="submit"
                        className="text-muted-foreground hover:text-destructive transition-colors"
                        aria-label="삭제"
                      >
                        <Trash2 size={15} />
                      </button>
                    </form>
                  </div>
                </TableCell>
              </TableRow>
            ))}

            {members && members.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-10">
                  등록된 회원이 없습니다.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
