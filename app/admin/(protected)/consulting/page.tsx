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

function statusVariant(status: string) {
  return status === "답변완료" ? ("default" as const) : ("destructive" as const);
}

export default async function AdminConsultingPage() {
  const supabase = createAdminClient();
  const { data: consultations, error } = await supabase
    .from("consultations")
    .select("id, name, subject, channel, status, created_at")
    .order("created_at", { ascending: false });

  return (
    <div>
      <PageHeader
        title="상담목록"
        description={`/contact 무료상담 폼으로 접수된 ${consultations?.length ?? 0}건의 문의입니다.`}
      />

      {error && (
        <p className="text-sm text-destructive mb-4">상담 목록을 불러오지 못했습니다: {error.message}</p>
      )}

      <div className="rounded-xl border border-border bg-white overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>이름</TableHead>
              <TableHead>제목</TableHead>
              <TableHead>유입 경로</TableHead>
              <TableHead>등록일</TableHead>
              <TableHead>상태</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(consultations ?? []).map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.name}</TableCell>
                <TableCell className="text-muted-foreground">{c.subject}</TableCell>
                <TableCell className="text-muted-foreground">{c.channel}</TableCell>
                <TableCell className="text-muted-foreground">
                  {new Date(c.created_at).toLocaleDateString("ko-KR")}
                </TableCell>
                <TableCell>
                  <Badge variant={statusVariant(c.status)}>{c.status}</Badge>
                </TableCell>
              </TableRow>
            ))}

            {consultations && consultations.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-10">
                  접수된 상담이 없습니다.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
