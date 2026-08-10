import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";

const MAX_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const BUCKET = "newsletter-images";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "파일이 없습니다." }, { status: 400 });
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "JPG, PNG, GIF, WEBP만 업로드 가능합니다." }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "이미지 크기는 5MB 이하여야 합니다." }, { status: 400 });
  }

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const filename = `${randomUUID()}.${ext}`;

  const supabase = createAdminClient();
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(filename, Buffer.from(await file.arrayBuffer()), {
      contentType: file.type,
    });

  if (error) {
    return NextResponse.json({ error: "이미지 업로드에 실패했습니다." }, { status: 500 });
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(filename);

  return NextResponse.json({ url: data.publicUrl });
}
