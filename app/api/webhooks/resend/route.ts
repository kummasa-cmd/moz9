import { NextRequest, NextResponse } from "next/server";
import {
  classifyResendWebhookEvent,
  describeWebhookAction,
  verifyResendWebhook,
} from "@/lib/newsletter/resend-webhooks";

// Resend webhook endpoint (3단계: 서명 검증 + 분류 후 수신 확인만).
// Nothing is written to Supabase yet — 4단계 applies the classified action
// (newsletter_broadcast_sends stats, bounce / complaint / Resend-unsubscribe
// → newsletter_subscribers + newsletter_suppressions), deduped on svix-id.
//
// Inert until RESEND_WEBHOOK_SECRET is set (503 without it) and a webhook is
// registered in the Resend dashboard — neither is done automatically.
export async function POST(request: NextRequest) {
  // Signature is computed over the exact bytes Resend sent — read the raw
  // body, never re-serialize parsed JSON.
  const rawBody = await request.text();
  const verified = verifyResendWebhook(rawBody, request.headers, process.env.RESEND_WEBHOOK_SECRET);

  if (!verified.ok) {
    return NextResponse.json({ error: verified.error }, { status: verified.status });
  }

  const action = classifyResendWebhookEvent(verified.event);
  console.info("[newsletter] Resend webhook 수신:", verified.webhookId, describeWebhookAction(action));

  return NextResponse.json({ received: true });
}
