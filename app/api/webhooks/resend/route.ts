import { NextRequest, NextResponse, after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { describeWebhookPlan, planResendWebhookEvent, verifyResendWebhook } from "@/lib/newsletter/resend-webhooks";
import { processResendWebhook } from "@/lib/newsletter/webhook-processor";
import { createWebhookStore } from "@/lib/newsletter/webhook-store";
import {
  createSuppressionsClient,
  isSuppressionReconcileEnabled,
  syncSubscriberContact,
} from "@/lib/newsletter/contact-sync";
import { resolveProviderSuppression } from "@/lib/newsletter/resend-suppressions";

// Resend webhook endpoint (4단계). Verifies the Svix signature, then applies
// the event to Supabase through webhook-processor.ts (idempotent on svix-id).
//
// Inert until RESEND_WEBHOOK_SECRET is set (503, nothing read or written) and
// a webhook is registered in the Resend dashboard — neither is automatic.
export async function POST(request: NextRequest) {
  // The signature covers the exact bytes Resend sent — read the raw body,
  // never re-serialize parsed JSON.
  const rawBody = await request.text();
  const verified = verifyResendWebhook(rawBody, request.headers, process.env.RESEND_WEBHOOK_SECRET);

  if (!verified.ok) {
    return NextResponse.json({ error: verified.error }, { status: verified.status });
  }

  // email.suppressed / suppression.added are applied to subscribers only
  // while NEWSLETTER_SUPPRESSION_RECONCILE_ENABLED=true; otherwise they're
  // recorded (IGNORED provider_check_disabled) and the cron / script picks
  // the address up later from the Resend suppression list.
  const resolver = isSuppressionReconcileEnabled()
    ? (() => {
        const client = createSuppressionsClient();
        return (check: Parameters<typeof resolveProviderSuppression>[1]) => resolveProviderSuppression(client, check);
      })()
    : undefined;

  const result = await processResendWebhook(
    { webhookId: verified.webhookId, event: verified.event },
    { store: createWebhookStore(createAdminClient()), resolveProviderSuppression: resolver },
  );

  // Log-safe: svix id, event type, plan summary, result — never addresses.
  console.info(
    "[newsletter] Resend webhook:",
    verified.webhookId,
    describeWebhookPlan(planResendWebhookEvent(verified.event)),
    result.result,
    result.outcome ?? "",
  );

  // Complaint / bounce / provider suppression changed a subscriber Resend still has as subscribed —
  // push it now rather than waiting for the retry job. No-op unless
  // NEWSLETTER_CONTACT_SYNC_ENABLED=true; failures are only recorded.
  if (result.resyncSubscriberId) {
    const subscriberId = result.resyncSubscriberId;
    after(() => syncSubscriberContact(subscriberId));
  }

  if (result.httpStatus !== 200) {
    return NextResponse.json({ error: result.result }, { status: result.httpStatus });
  }
  return NextResponse.json({ received: true, result: result.result });
}
