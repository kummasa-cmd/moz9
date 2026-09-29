import { NextRequest, NextResponse } from "next/server";
import { newsletterConfig } from "@/lib/newsletter/config";
import { retryPendingContactSyncs } from "@/lib/newsletter/contact-sync";

// Retries Resend Contact syncs that failed or never ran (2단계). Separate
// from send-due on purpose: it never touches campaigns or deliveries, and it
// stands down while a campaign is SENDING. No-op unless
// NEWSLETTER_CONTACT_SYNC_ENABLED=true.
async function handle(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (!newsletterConfig.cronSecret || auth !== `Bearer ${newsletterConfig.cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const summary = await retryPendingContactSyncs();
    return NextResponse.json(summary);
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
