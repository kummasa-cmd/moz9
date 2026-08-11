"use client";

import { useTransition } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PARTNER_POST_STATUSES } from "./types";
import { updatePartnerPostStatus } from "./actions";

type Props = {
  postId: string;
  status: string;
  page: number;
  limit: number;
};

export default function PartnerStatusForm({ postId, status, page, limit }: Props) {
  const [isPending, startTransition] = useTransition();

  function handleChange(next: string | null) {
    if (!next || next === status) return;

    const formData = new FormData();
    formData.set("status", next);
    formData.set("page", String(page));
    formData.set("limit", String(limit));

    startTransition(() => {
      updatePartnerPostStatus(postId, formData);
    });
  }

  return (
    <Select value={status} onValueChange={handleChange} disabled={isPending}>
      <SelectTrigger size="sm" className="text-xs flex-shrink-0">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {PARTNER_POST_STATUSES.map((s) => (
          <SelectItem key={s} value={s}>
            {s}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
