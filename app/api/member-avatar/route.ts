import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkAdmin } from "@/lib/admin-guard";
import { handleImageUpload } from "@/lib/uploads/image-upload";

const BUCKET = "member-avatars";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const [{ data: { user } }, admin] = await Promise.all([supabase.auth.getUser(), checkAdmin()]);
  if (!user && !admin) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { status, body } = await handleImageUpload(request, BUCKET, () => createAdminClient().storage);
  return NextResponse.json(body, { status });
}
