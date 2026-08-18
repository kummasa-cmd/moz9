import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const db = createAdminClient();

  const result = await db
    .from("newsletters")
    .select("id, title, slug, status")
    .eq("slug", slug)
    .eq("status", "PUBLISHED")
    .maybeSingle();

  return NextResponse.json({
    source: "path-param",
    rawUrl: request.nextUrl.pathname,
    slug,
    slugCodePoints: [...slug].map((c) => c.codePointAt(0)?.toString(16)),
    error: result.error,
    found: !!result.data,
    data: result.data,
  });
}
