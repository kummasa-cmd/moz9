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
};

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
}: Props) {
  const [enabled, setEnabled] = useState(defaultEnabled);
  const [sendType, setSendType] = useState(defaultSendType);

  return (
    <div className="rounded-xl border border-border bg-white p-6 space-y-6">
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
                Vercel Cron은 하루 1회 실행되므로 실제 발송 시각은 등록된 크론 실행 시각을 기준으로
                처리됩니다.
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
