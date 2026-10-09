import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { handleImageUpload } from "@/lib/uploads/image-upload";
import { canUploadBoardImage } from "@/lib/uploads/uploader-auth";

const BUCKET = "board-images";

// Admin or active member (see lib/uploads/uploader-auth.ts). Authenticate before reading the body.
export async function POST(request: NextRequest) {
  if (!(await canUploadBoardImage())) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { status, body } = await handleImageUpload(request, BUCKET, () => createAdminClient().storage);
  return NextResponse.json(body, { status });
}
