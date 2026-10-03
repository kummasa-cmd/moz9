import { FlaskConical } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { createAdminClient } from "@/lib/supabase/admin";
import { MAX_TEST_RECIPIENTS } from "@/lib/newsletter/test-send";
import { addTestRecipient, deleteTestRecipient, setTestRecipientActive } from "./test-recipient-actions";

type Props = { notice?: string; error?: string };

// 테스트 계정: a separate list from the subscribers below. Used only by the
// editor's "발송 대상: 테스트 계정" — never part of a real send.
export default async function TestRecipientsPanel({ notice, error }: Props) {
  const { data: recipients, error: loadError } = await createAdminClient()
    .from("newsletter_test_recipients")
    .select("id, email, name, memo, active, created_at")
    .order("created_at", { ascending: true });

  const activeCount = (recipients ?? []).filter((r) => r.active).length;

  return (
    <section id="test-recipients" className="rounded-xl border border-border bg-white p-5 space-y-4 mb-6">
      <div>
        <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
          <FlaskConical size={15} />
          테스트 계정 <span className="font-normal text-muted-foreground">(활성 {activeCount}명)</span>
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          구독자와 별도로 관리되는 테스트 발송 전용 목록입니다. 뉴스레터 편집 화면에서 발송 대상을 &lsquo;테스트 계정&rsquo;으로
          고르면 활성 계정에게만 [테스트] 메일이 즉시 발송됩니다(최대 {MAX_TEST_RECIPIENTS}명). 구독자 목록·발송·통계에는
          영향이 없습니다.
        </p>
      </div>

      {loadError ? (
        <p className="text-sm text-destructive">
          테스트 계정 목록을 불러오지 못했습니다: {loadError.message} (migration 0032 적용 여부를 확인해 주세요)
        </p>
      ) : (
        <>
          <form action={addTestRecipient} className="grid grid-cols-1 sm:grid-cols-[2fr_1fr_2fr_auto] gap-3 items-end">
            <div className="space-y-1.5">
              <Label htmlFor="test-email">이메일</Label>
              <Input id="test-email" name="email" type="email" required placeholder="tester@example.com" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="test-name">이름 (선택)</Label>
              <Input id="test-name" name="name" placeholder="홍길동" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="test-memo">메모 (선택)</Label>
              <Input id="test-memo" name="memo" placeholder="네이버 수신 확인용" />
            </div>
            <button
              type="submit"
              className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
            >
              추가
            </button>
          </form>

          {notice && <p className="text-sm text-primary">{notice}</p>}
          {error && <p className="text-sm text-destructive">{error}</p>}

          {(recipients ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">등록된 테스트 계정이 없습니다.</p>
          ) : (
            <ul className="divide-y divide-border rounded-md border border-border">
              {(recipients ?? []).map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                  <Badge variant={r.active ? "default" : "outline"}>{r.active ? "활성" : "비활성"}</Badge>
                  <span className="font-medium text-foreground">{r.email}</span>
                  {r.name && <span className="text-muted-foreground">{r.name}</span>}
                  {r.memo && <span className="text-xs text-muted-foreground">· {r.memo}</span>}
                  <div className="ml-auto flex gap-2">
                    <form action={setTestRecipientActive}>
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="active" value={r.active ? "false" : "true"} />
                      <button type="submit" className="rounded-md border border-border px-2.5 py-1 text-xs hover:bg-muted transition-colors">
                        {r.active ? "비활성화" : "활성화"}
                      </button>
                    </form>
                    <form action={deleteTestRecipient}>
                      <input type="hidden" name="id" value={r.id} />
                      <button
                        type="submit"
                        className="rounded-md border border-border px-2.5 py-1 text-xs text-destructive hover:bg-destructive/10 transition-colors"
                      >
                        삭제
                      </button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
