import { NextRequest, NextResponse } from "next/server";
import { newsletterConfig } from "@/lib/newsletter/config";
import { createAdminClient } from "@/lib/supabase/admin";
import { handleSchedulerHealth, loadHealthCampaigns } from "@/lib/newsletter/scheduler-health";

// Read-only scheduler health check (see lib/newsletter/scheduler-health.ts):
// 200 when nothing is late, 503 when a campaign is overdue or stuck in
// SENDING, 500 when the DB can't be read. Polled by an external monitor on
// its own schedule, independent of send-due.
async function handle(request: NextRequest) {
  const { status, body } = await handleSchedulerHealth({
    authorization: request.headers.get("authorization"),
    cronSecret: newsletterConfig.cronSecret,
    loadCampaigns: () => loadHealthCampaigns(createAdminClient()),
  });
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
