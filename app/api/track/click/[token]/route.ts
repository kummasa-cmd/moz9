import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const url = request.nextUrl.searchParams.get("url");

  const fallback = new URL("/", request.url);
  if (!url || !/^https?:\/\//i.test(url)) {
    return NextResponse.redirect(fallback);
  }

  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return NextResponse.redirect(fallback);
  }

  const db = createAdminClient();
  const { data: delivery } = await db
    .from("newsletter_deliveries")
    .select("id, click_count, opened_at, first_click_at")
    .eq("tracking_token", token)
    .maybeSingle();

  if (delivery) {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
    const ipHash = ip ? createHash("sha256").update(ip).digest("hex") : null;

    await db.from("newsletter_click_events").insert({
      delivery_id: delivery.id,
      url: target.toString(),
      user_agent: request.headers.get("user-agent"),
      ip_hash: ipHash,
    });

    await db
      .from("newsletter_deliveries")
      .update({
        click_count: (delivery.click_count ?? 0) + 1,
        opened_at: delivery.opened_at ?? new Date().toISOString(),
        first_click_at: delivery.first_click_at ?? new Date().toISOString(),
        status: "CLICKED",
      })
      .eq("id", delivery.id);
  }

  return NextResponse.redirect(target);
}
