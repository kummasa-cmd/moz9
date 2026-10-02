import { NextRequest, NextResponse } from "next/server";
import { newsletterConfig } from "@/lib/newsletter/config";
import { runContactSyncCron } from "@/lib/newsletter/contact-sync";

// Retries Resend Contact syncs that failed or never ran (2단계). Separate
// from send-due on purpose: it never touches campaigns or deliveries, and it
// stands down while a campaign is SENDING. No-op unless
// NEWSLETTER_CONTACT_SYNC_ENABLED=true.
//
// Stage 4.5: with NEWSLETTER_SUPPRESSION_RECONCILE_ENABLED=true it first
// reconciles the Resend account suppression list into Supabase. A failed
// reconciliation answers 502 (with the summary) — the Contact retries have
// still run.
async function handle(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (!newsletterConfig.cronSecret || auth !== `Bearer ${newsletterConfig.cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { ok, summary } = await runContactSyncCron();
    return NextResponse.json(summary, { status: ok ? 200 : 502 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[newsletter] Resend Contact 재동기화 실패:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
