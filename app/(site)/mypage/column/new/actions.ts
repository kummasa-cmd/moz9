"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { canWriteToBoard } from "@/lib/community-auth";

// Same insert as app/(site)/community/[slug]/actions.ts::createPost, but the
// board is chosen by the writer inside the mypage form (게시판 종류 select)
// instead of being fixed by the route's [slug] segment, so it reads slug from
// the submitted form instead of a bound param.
export async function createMyColumnPost(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const content = String(formData.get("content") ?? "").trim();
  const category_id = String(formData.get("category_id") ?? "") || null;

  if (!slug || !title || !content) {
    redirect(`/mypage/column/new?error=${encodeURIComponent("게시판 종류, 제목, 내용을 모두 입력해 주세요.")}`);
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/mypage/column/new");

  const admin = createAdminClient();

  const { data: board } = await admin
    .from("boards")
    .select("id, allow_user_write, column_only")
    .eq("slug", slug)
    .eq("column_only", true)
    .maybeSingle();

  if (!board || !(await canWriteToBoard(user, board))) {
    redirect(`/mypage/column/new?error=${encodeURIComponent("글쓰기 권한이 없습니다.")}`);
  }

  const { data: memberData } = await admin.from("members").select("nickname").eq("user_id", user.id).maybeSingle();
  const author = memberData?.nickname ?? user.user_metadata?.name ?? user.email ?? "익명";

  const { error } = await admin.from("board_posts").insert({
    board_id: board.id,
    title,
    content,
    category_id,
    author,
    user_id: user.id,
    status: "게시중",
  });

  if (error) {
    redirect(`/mypage/column/new?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/community/${slug}`);
  revalidatePath("/community");
  revalidatePath("/mypage/column");
  revalidatePath("/mypage");
  redirect("/mypage/column");
}
