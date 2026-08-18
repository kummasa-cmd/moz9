import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get("slug") ?? "";
  const db = createAdminClient();

  const result = await db
    .from("newsletters")
    .select(
      "id, title, slug, subject, preheader, thumbnail_url, status, blocks, view_count, like_count, dislike_count, published_at, created_at",
    )
    .eq("slug", slug)
    .eq("status", "PUBLISHED")
    .maybeSingle();

  return NextResponse.json({
    slug,
    slugLength: slug.length,
    slugCodePoints: [...slug].map((c) => c.codePointAt(0)?.toString(16)),
    env: {
      hasUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      urlHost: process.env.NEXT_PUBLIC_SUPABASE_URL
        ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).host
        : null,
      hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    },
    error: result.error,
    status: result.status,
    statusText: result.statusText,
    found: !!result.data,
    data: result.data
      ? { id: result.data.id, title: result.data.title, slug: result.data.slug, status: result.data.status }
      : null,
  });
}
