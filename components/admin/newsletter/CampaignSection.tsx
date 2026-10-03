"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormSelect } from "@/components/admin/FormSelect";

type Props = {
  campaignId?: string;
  defaultEnabled?: boolean;
  defaultCampaignName?: string;
  defaultSendType?: string;
  defaultScheduledAt?: string;
  defaultRecurringTime?: string;
  defaultRangeStart?: string;
  defaultRangeEnd?: string;
  defaultTargetAll?: boolean;
  defaultTargetTags?: string;
  // Set when the campaign already went out (or is going out): the send
  // settings are shown read-only and not submitted. The server action
  // enforces the same rule (lib/newsletter/campaign-save.ts).
  lockedReason?: string | null;
  // Active rows of newsletter_test_recipients; null when the list couldn't be
  // read (e.g. migration 0032 not applied yet).
  testRecipientCount?: number | null;
};

type SendTarget = "SUBSCRIBERS" | "TEST";

export function CampaignSection({
  campaignId,
  defaultEnabled = false,
  defaultCampaignName = "",
  defaultSendType = "SCHEDULED",
  defaultScheduledAt = "",
  defaultRecurringTime = "09:00",
  defaultRangeStart = "",
  defaultRangeEnd = "",
  defaultTargetAll = true,
  defaultTargetTags = "",
  lockedReason = null,
  testRecipientCount = null,
}: Props) {
  const [target, setTarget] = useState<SendTarget>("SUBSCRIBERS");
  const [enabled, setEnabled] = useState(defaultEnabled);
  const [sendType, setSendType] = useState(defaultSendType);

  // "테스트 계정" sends the saved content to the test list on save and leaves
  // the campaign (below) untouched — see sendNewsletterTestFor in
  // app/admin/(protected)/site/newsletter/manage/actions.ts.
  const targetPicker = (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-foreground">발송 대상</p>
      <div className="flex flex-wrap gap-4 text-sm text-foreground">
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="send_target"
            value="SUBSCRIBERS"
            checked={target === "SUBSCRIBERS"}
            onChange={() => setTarget("SUBSCRIBERS")}
            className="size-4"
          />
          구독자
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="send_target"
            value="TEST"
            checked={target === "TEST"}
            onChange={() => setTarget("TEST")}
            className="size-4"
          />
          테스트 계정{testRecipientCount === null ? "" : ` (활성 ${testRecipientCount}명)`}
        </label>
      </div>
      {target === "TEST" && (
        <p className="text-sm text-muted-foreground rounded-md bg-muted/50 px-3 py-2">
          저장하면 내용을 저장한 뒤 활성 테스트 계정에게만 즉시 테스트 메일을 보냅니다. 제목 앞에 [테스트]가 붙고,
          구독자 발송·예약 설정·발행호수·통계에는 영향이 없습니다. 테스트 계정은 구독자관리에서 관리합니다.
          {testRecipientCount === 0 && " 현재 활성 테스트 계정이 없습니다."}
        </p>
      )}
    </div>
  );

  if (target === "TEST") {
    return <div className="rounded-xl border border-border bg-white p-6 space-y-6">{targetPicker}</div>;
  }

  if (lockedReason) {
    return (
      <div className="rounded-xl border border-border bg-white p-6 space-y-6">
        {targetPicker}
        <div className="space-y-2 border-t border-border pt-6">
          <p className="text-sm font-semibold text-foreground">발송 예약 설정</p>
          <p className="text-sm text-muted-foreground rounded-md bg-muted/50 px-3 py-2">{lockedReason}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-white p-6 space-y-6">
      {targetPicker}
      {campaignId && <input type="hidden" name="campaign_id" value={campaignId} />}

      <label className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <input
          type="checkbox"
          name="enable_campaign"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="size-4 rounded border-input"
        />
        발송 예약 설정
      </label>

      {enabled && (
        <div className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="campaign_name">캠페인 이름</Label>
            <Input
              id="campaign_name"
              name="campaign_name"
              defaultValue={defaultCampaignName}
              placeholder="비워두면 뉴스레터 제목과 동일하게 사용"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="send_type">발송 방식</Label>
            <FormSelect
              id="send_type"
              name="send_type"
              value={sendType}
              onChange={(e) => setSendType(e.target.value)}
            >
              <option value="IMMEDIATE">즉시 발송</option>
              <option value="SCHEDULED">선택일 발송</option>
              <option value="RECURRING">매일 자동 발송</option>
              <option value="RANGE">기간 발송 (매일)</option>
            </FormSelect>
          </div>

          {sendType === "SCHEDULED" && (
            <div className="space-y-2">
              <Label htmlFor="scheduled_at">발송 일시</Label>
              <Input
                id="scheduled_at"
                name="scheduled_at"
                type="datetime-local"
                required
                defaultValue={defaultScheduledAt}
              />
            </div>
          )}

          {sendType === "RECURRING" && (
            <div className="space-y-2">
              <Label htmlFor="recurring_time">매일 발송 시각</Label>
              <Input
                id="recurring_time"
                name="recurring_time"
                type="time"
                required
                defaultValue={defaultRecurringTime}
              />
              <p className="text-xs text-muted-foreground">
                설정한 시각(한국 시간) 이후 첫 자동 발송 점검(약 5분 간격)에서 발송됩니다.
              </p>
            </div>
          )}

          {sendType === "RANGE" && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="range_start">시작일</Label>
                <Input
                  id="range_start"
                  name="range_start"
                  type="date"
                  required
                  defaultValue={defaultRangeStart}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="range_end">종료일</Label>
                <Input id="range_end" name="range_end" type="date" required defaultValue={defaultRangeEnd} />
              </div>
            </div>
          )}

          {sendType === "IMMEDIATE" && (
            <p className="text-sm text-muted-foreground rounded-md bg-muted/50 px-3 py-2">
              저장 후 발송 목록에서 발송을 실행할 수 있습니다. (실제 발송 연결은 다음 단계에서
              구현됩니다)
            </p>
          )}

          <div className="space-y-2 border-t border-border pt-6">
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                name="target_all"
                defaultChecked={defaultTargetAll}
                className="size-4 rounded border-input"
              />
              전체 구독자에게 발송
            </label>
            <Label htmlFor="target_tags">태그로 대상 좁히기 (선택, 콤마로 구분)</Label>
            <Input id="target_tags" name="target_tags" defaultValue={defaultTargetTags} placeholder="VIP, 작가" />
          </div>
        </div>
      )}
    </div>
  );
}
