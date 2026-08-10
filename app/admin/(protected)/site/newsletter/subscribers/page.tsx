import { UserPlus, Upload } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import PageHeader from "@/components/admin/PageHeader";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  addSubscriber,
  bulkAddSubscribers,
  deleteSubscriber,
  deleteSubscribers,
  setSubscriberStatus,
} from "./actions";
import SubscribersTable from "./SubscribersTable";
import { PAGE_SIZE_OPTIONS, type SubscriberRow } from "../types";

const DEFAULT_PAGE_SIZE = 20;

type Props = {
  searchParams: Promise<{ page?: string; limit?: string; error?: string; imported?: string }>;
};

export default async function AdminNewsletterSubscribersPage({ searchParams }: Props) {
  const sp = await searchParams;

  const limit = PAGE_SIZE_OPTIONS.includes(Number(sp.limit)) ? Number(sp.limit) : DEFAULT_PAGE_SIZE;
  const page = Math.max(1, Number(sp.page) || 1);
  const offset = (page - 1) * limit;

  const supabase = createAdminClient();
  const {
    data: subscribers,
    error,
    count,
  } = await supabase
    .from("newsletter_subscribers")
    .select("id, email, name, source, status, tags, subscribed_at", { count: "exact" })
    .order("subscribed_at", { ascending: false })
    .range(offset, offset + limit - 1);

  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / limit));

  const rows: SubscriberRow[] = (subscribers ?? []).map((s) => ({
    id: s.id,
    email: s.email,
    name: s.name,
    source: s.source,
    status: s.status,
    tags: s.tags ?? [],
    subscribedAt: s.subscribed_at,
  }));

  return (
    <div>
      <PageHeader
        title="구독자관리"
        description={`전체 ${totalCount}명 (회원가입 여부와 무관하게 이메일 주소를 아는 모든 대상을 관리합니다)`}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <form
          action={addSubscriber}
          className="rounded-xl border border-border bg-white p-5 space-y-3"
        >
          <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
            <UserPlus size={15} />
            개별 등록
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="subscriber-email">이메일</Label>
              <Input id="subscriber-email" name="email" type="email" required placeholder="hello@example.com" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="subscriber-name">이름 (선택)</Label>
              <Input id="subscriber-name" name="name" placeholder="홍길동" />
            </div>
          </div>
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
          >
            등록
          </button>
        </form>

        <form
          action={bulkAddSubscribers}
          className="rounded-xl border border-border bg-white p-5 space-y-3"
        >
          <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
            <Upload size={15} />
            여러 명 한 번에 등록
          </p>
          <Textarea
            name="emails"
            rows={3}
            placeholder={"한 줄에 이메일 하나씩 붙여넣어 주세요.\nhello@example.com, 홍길동 (이름은 선택)"}
          />
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
          >
            일괄 등록
          </button>
        </form>
      </div>

      {error && (
        <p className="text-sm text-destructive mb-4">목록을 불러오지 못했습니다: {error.message}</p>
      )}
      {sp.error && <p className="text-sm text-destructive mb-4">{sp.error}</p>}
      {sp.imported && (
        <p className="text-sm text-primary mb-4">{sp.imported}건이 등록되었습니다 (중복 이메일은 건너뜀).</p>
      )}

      <SubscribersTable
        subscribers={rows}
        page={page}
        limit={limit}
        totalPages={totalPages}
        setStatusAction={setSubscriberStatus}
        deleteSubscriberAction={deleteSubscriber}
        deleteSubscribersAction={deleteSubscribers}
      />
    </div>
  );
}
