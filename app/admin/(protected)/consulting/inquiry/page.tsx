import Link from "next/link";
import { CheckCircle, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import PageHeader from "@/components/admin/PageHeader";
import { createAdminClient } from "@/lib/supabase/admin";
import { replyInquiry } from "./actions";

function statusVariant(status: string) {
  return status === "답변완료" ? ("default" as const) : ("destructive" as const);
}

type InquiryPageProps = {
  searchParams: Promise<{ id?: string; error?: string }>;
};

export default async function AdminConsultingInquiryPage({ searchParams }: InquiryPageProps) {
  const { id, error } = await searchParams;

  const supabase = createAdminClient();
  const { data: inquiries } = await supabase
    .from("inquiries")
    .select("id, member_name, question, answer, status, created_at")
    .order("created_at", { ascending: false });

  const selected = inquiries?.find((q) => q.id === id) ?? inquiries?.[0];

  return (
    <div>
      <PageHeader title="1대1문의" description="회원이 남긴 1:1 문의에 답변합니다." />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 rounded-xl border border-border bg-white overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>이름</TableHead>
                <TableHead>문의 내용</TableHead>
                <TableHead>등록일</TableHead>
                <TableHead>상태</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(inquiries ?? []).map((q) => (
                <TableRow
                  key={q.id}
                  className={selected?.id === q.id ? "bg-primary/5" : ""}
                >
                  <TableCell className="font-medium p-0">
                    <Link href={`/admin/consulting/inquiry?id=${q.id}`} className="block px-2 py-2">
                      {q.member_name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground p-0">
                    <Link href={`/admin/consulting/inquiry?id=${q.id}`} className="block px-2 py-2">
                      {q.question}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(q.created_at).toLocaleDateString("ko-KR")}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(q.status)}>{q.status}</Badge>
                  </TableCell>
                </TableRow>
              ))}

              {inquiries && inquiries.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-10">
                    등록된 1:1 문의가 없습니다.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {selected && (
          <div className="rounded-xl border border-border bg-white p-5">
            <p className="text-xs text-muted-foreground mb-1">{selected.member_name}님의 문의</p>
            <p className="text-sm text-foreground font-medium mb-4">{selected.question}</p>

            {selected.status === "답변완료" ? (
              <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
                <CheckCircle size={36} className="text-primary" />
                <p className="text-sm text-foreground font-medium">답변이 등록되었습니다</p>
                <p className="text-xs text-muted-foreground">{selected.answer}</p>
              </div>
            ) : (
              <form action={replyInquiry.bind(null, selected.id)} className="space-y-3">
                <Label htmlFor="answer">답변</Label>
                <Textarea id="answer" name="answer" rows={6} required placeholder="답변 내용을 입력해 주세요" />

                {error && <p className="text-xs text-destructive">{error}</p>}

                <button
                  type="submit"
                  className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-5 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors w-full"
                >
                  <Send size={14} />
                  답변 등록
                </button>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
