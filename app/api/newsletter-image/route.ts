import { NextRequest, NextResponse } from "next/server";
import { requireAdminForRoute } from "@/lib/admin-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { handleImageUpload } from "@/lib/uploads/image-upload";

const BUCKET = "newsletter-images";

// Admin-only upload. Authenticate before reading the body.
export async function POST(request: NextRequest) {
  const auth = await requireAdminForRoute();
  if (!auth.ok) return auth.response;

  const { status, body } = await handleImageUpload(request, BUCKET, () => createAdminClient().storage);
  return NextResponse.json(body, { status });
}
