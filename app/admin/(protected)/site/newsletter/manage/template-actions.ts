"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ContentBlock } from "@/lib/newsletter/blocks/types";

export type SaveTemplateResult = { ok: true } | { ok: false; error: string };

export async function saveNewsletterTemplate(
  name: string,
  blocks: ContentBlock[],
): Promise<SaveTemplateResult> {
  const trimmedName = name.trim();
  if (!trimmedName) return { ok: false, error: "템플릿 이름을 입력해 주세요." };
  if (blocks.length === 0) return { ok: false, error: "저장할 블록이 없습니다." };

  const supabase = createAdminClient();
  const { error } = await supabase.from("newsletter_templates").insert({ name: trimmedName, blocks });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/site/newsletter/manage");
  return { ok: true };
}

export async function deleteNewsletterTemplate(id: string): Promise<void> {
  const supabase = createAdminClient();
  await supabase.from("newsletter_templates").delete().eq("id", id);
  revalidatePath("/admin/site/newsletter/manage");
}
