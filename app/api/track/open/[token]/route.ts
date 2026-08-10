import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const TRANSPARENT_GIF = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==",
  "base64",
);

export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const db = createAdminClient();
  const { data: delivery } = await db
    .from("newsletter_deliveries")
    .select("id, opened_at, status")
    .eq("tracking_token", token)
    .maybeSingle();

  if (delivery && delivery.status !== "CLICKED") {
    await db
      .from("newsletter_deliveries")
      .update({ opened_at: delivery.opened_at ?? new Date().toISOString(), status: "OPENED" })
      .eq("id", delivery.id);
  }

  return new NextResponse(TRANSPARENT_GIF, {
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}
