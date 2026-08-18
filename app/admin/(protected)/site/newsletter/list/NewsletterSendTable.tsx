"use client";

import { useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Pencil, Trash2, Eye, XCircle, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CAMPAIGN_SEND_TYPE_LABEL, CAMPAIGN_STATUS_LABEL, NEWSLETTER_STATUS_LABEL } from "../labels";
import { PAGE_SIZE_OPTIONS, type CampaignSummary, type NewsletterSendRow } from "../types";

function statusVariant(status: string) {
  if (status === "PUBLISHED") return "default" as const;
  return "secondary" as const;
}

function campaignVariant(status: string) {
  if (status === "SENT") return "default" as const;
  if (status === "FAILED" || status === "CANCELLED") return "destructive" as const;
  return "secondary" as const;
}

function scheduleSummary(c: CampaignSummary) {
  if (c.sendType === "IMMEDIATE") return "즉시 발송";
  if (c.sendType === "SCHEDULED") {
    return c.scheduledAt ? new Date(c.scheduledAt).toLocaleString("ko-KR") : "-";
  }
  if (c.sendType === "RECURRING") return `매일 ${c.recurringTime ?? ""}`;
  if (c.sendType === "RANGE") return `${c.rangeStart ?? "-"} ~ ${c.rangeEnd ?? "-"}`;
  return "-";
}

type Props = {
  newsletters: NewsletterSendRow[];
  page: number;
  limit: number;
  totalPages: number;
  deleteNewsletterAction: (formData: FormData) => Promise<void>;
  deleteNewslettersAction: (formData: FormData) => Promise<void>;
  cancelCampaignAction: (formData: FormData) => Promise<void>;
  sendCampaignNowAction: (formData: FormData) => Promise<void>;
};

export default function NewsletterSendTable({
  newsletters,
  page,
  limit,
  totalPages,
  deleteNewsletterAction,
  deleteNewslettersAction,
  cancelCampaignAction,
  sendCampaignNowAction,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();

  const allSelected = newsletters.length > 0 && newsletters.every((n) => selected.has(n.id));

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(newsletters.map((n) => n.id)));
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function updateQuery(next: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) params.set(key, value);
    router.push(`${pathname}?${params.toString()}`);
  }

  function handleBulkDelete() {
    if (selected.size === 0) {
      window.alert("삭제할 뉴스레터를 선택해 주세요.");
      return;
    }
    if (!window.confirm("정말로 삭제하겠습니까? 예약된 발송도 함께 삭제됩니다.")) return;

    const formData = new FormData();
    selected.forEach((id) => formData.append("ids", id));

    startTransition(async () => {
      await deleteNewslettersAction(formData);
      setSelected(new Set());
    });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-muted-foreground">
          {selected.size > 0 ? `${selected.size}건 선택됨` : "뉴스레터를 선택하세요"}
        </span>
        <button
          type="button"
          onClick={handleBulkDelete}
          disabled={isPending}
          className="inline-flex items-center gap-1.5 rounded-md border border-destructive/30 bg-white px-3 py-1.5 text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
        >
          <Trash2 size={14} />
          전체삭제
        </button>
      </div>

      <div className="rounded-xl border border-border bg-white overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label="전체 선택" />
              </TableHead>
              <TableHead>제목</TableHead>
              <TableHead>콘텐츠 상태</TableHead>
              <TableHead>발송 방식</TableHead>
              <TableHead>발송 일정</TableHead>
              <TableHead>발송 상태</TableHead>
              <TableHead>발송수</TableHead>
              <TableHead>조회수</TableHead>
              <TableHead>좋아요</TableHead>
              <TableHead>아쉬워요</TableHead>
              <TableHead className="text-right">관리</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {newsletters.map((n) => (
              <TableRow key={n.id}>
                <TableCell>
                  <Checkbox
                    checked={selected.has(n.id)}
                    onCheckedChange={() => toggleOne(n.id)}
                    aria-label="선택"
                  />
                </TableCell>
                <TableCell className="font-medium">{n.title}</TableCell>
                <TableCell>
                  <Badge variant={statusVariant(n.status)}>
                    {NEWSLETTER_STATUS_LABEL[n.status] ?? n.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {n.campaign ? (CAMPAIGN_SEND_TYPE_LABEL[n.campaign.sendType] ?? n.campaign.sendType) : "-"}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {n.campaign ? scheduleSummary(n.campaign) : "-"}
                </TableCell>
                <TableCell>
                  {n.campaign ? (
                    <Badge variant={campaignVariant(n.campaign.status)}>
                      {CAMPAIGN_STATUS_LABEL[n.campaign.status] ?? n.campaign.status}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground/40">-</span>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {n.campaign
                    ? `${n.campaign.totalSent.toLocaleString()} / ${n.campaign.totalRecipients.toLocaleString()}`
                    : "-"}
                </TableCell>
                <TableCell className="text-muted-foreground">{n.viewCount.toLocaleString()}</TableCell>
                <TableCell className="text-muted-foreground">👍 {n.likeCount.toLocaleString()}</TableCell>
                <TableCell className="text-muted-foreground">👎 {n.dislikeCount.toLocaleString()}</TableCell>
                <TableCell className="text-right">
                  <div className="inline-flex items-center gap-3">
                    {n.campaign?.status === "SCHEDULED" && (
                      <>
                        <form
                          action={sendCampaignNowAction}
                          onSubmit={(e) => {
                            if (!window.confirm("지금 바로 구독자 전체에게 발송하시겠습니까?")) {
                              e.preventDefault();
                            }
                          }}
                        >
                          <input type="hidden" name="id" value={n.campaign.id} />
                          <button
                            type="submit"
                            className="text-muted-foreground hover:text-primary transition-colors"
                            aria-label="지금 발송"
                            title="지금 발송"
                          >
                            <Send size={15} />
                          </button>
                        </form>
                        <form action={cancelCampaignAction}>
                          <input type="hidden" name="id" value={n.campaign.id} />
                          <button
                            type="submit"
                            className="text-muted-foreground hover:text-destructive transition-colors"
                            aria-label="발송 취소"
                            title="발송 취소"
                          >
                            <XCircle size={15} />
                          </button>
                        </form>
                      </>
                    )}
                    <Link
                      href={`/admin/site/newsletter/list/${n.id}/preview`}
                      className="text-muted-foreground hover:text-primary transition-colors"
                      aria-label="미리보기"
                    >
                      <Eye size={15} />
                    </Link>
                    <Link
                      href={`/admin/site/newsletter/manage/${n.id}`}
                      className="text-muted-foreground hover:text-primary transition-colors"
                      aria-label="수정"
                    >
                      <Pencil size={15} />
                    </Link>
                    <form action={deleteNewsletterAction}>
                      <input type="hidden" name="id" value={n.id} />
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

            {newsletters.length === 0 && (
              <TableRow>
                <TableCell colSpan={11} className="text-center text-muted-foreground py-10">
                  등록된 뉴스레터가 없습니다.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between mt-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>페이지당</span>
          <Select
            value={String(limit)}
            onValueChange={(value) => {
              if (value) updateQuery({ limit: value, page: "1" });
            }}
          >
            <SelectTrigger size="sm" className="w-20">
              <SelectValue>{(value: string) => `${value}개`}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n}개
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => updateQuery({ page: String(page - 1) })}
              disabled={page <= 1}
              className="rounded-md border border-border px-3 py-1.5 text-sm disabled:opacity-40 hover:bg-muted transition-colors"
            >
              이전
            </button>
            <span className="px-2 text-sm text-muted-foreground tabular-nums">
              {page} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => updateQuery({ page: String(page + 1) })}
              disabled={page >= totalPages}
              className="rounded-md border border-border px-3 py-1.5 text-sm disabled:opacity-40 hover:bg-muted transition-colors"
            >
              다음
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
