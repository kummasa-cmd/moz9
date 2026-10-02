/**
 * Reconcile the Resend account suppression list into Supabase (Stage 4.5).
 *
 * Usage (from the project root):
 *   npx tsx scripts/newsletter/reconcile-resend-suppressions.ts            # DRY-RUN (default)
 *   npx tsx scripts/newsletter/reconcile-resend-suppressions.ts --apply    # writes
 *
 * Options:
 *   --apply          Actually apply: newsletter_apply_provider_suppression per
 *                    matched subscriber, then push each changed subscriber's
 *                    Resend Contact to unsubscribed. Without it nothing is
 *                    written anywhere — Resend and Supabase are only read
 *                    (GET /suppressions, GET /emails/{id}, selects).
 *   --delay-ms N     Pause between classifications / Contact syncs (default 600).
 *   --env PATH       Env file to load (default .env.local).
 *
 * What it does (lib/newsletter/suppression-reconcile.ts):
 *   - reads every Resend account suppression and every newsletter subscriber
 *   - for each suppressed address that is a subscriber, classifies it:
 *       origin=complaint                              → COMPLAINT → UNSUBSCRIBED
 *       origin=bounce + source email bounce Permanent → BOUNCE    → BOUNCED
 *       anything else / lookup failure                → PROVIDER_SUPPRESSED → SUPPRESSED
 *   - addresses that aren't subscribers (e.g. promo prospects) are counted only
 *   - never removes a Resend suppression, never re-subscribes anyone
 *
 * Output masks every address. Aborts (without harm) while a campaign is SENDING.
 * Requires migration 0030.
 */
import { existsSync } from "node:fs";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  SUBSCRIBER_SYNC_COLUMNS,
  createContactsClient,
  createSuppressionsClient,
  isCampaignSending,
  syncSubscriberRow,
  type SubscriberSyncRow,
} from "@/lib/newsletter/contact-sync";
import { createReconcileStore, reconcileProviderSuppressions, type ReconcileSummary } from "@/lib/newsletter/suppression-reconcile";
import { redactEmails } from "@/lib/newsletter/resend-contacts";

type Options = { apply: boolean; delayMs: number; envFile: string };

function parseArgs(argv: string[]): Options {
  const options: Options = { apply: false, delayMs: 600, envFile: ".env.local" };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--apply") options.apply = true;
    else if (arg === "--delay-ms") {
      const n = Number(argv[++i]);
      if (!Number.isFinite(n) || n < 0) throw new Error("--delay-ms needs a non-negative number");
      options.delayMs = n;
    } else if (arg === "--env") options.envFile = argv[++i] ?? options.envFile;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function printSummary(summary: ReconcileSummary, log: (line: string) => void = console.log): void {
  log(`[reconcile] Resend account suppressions:      ${summary.accountSuppressions}`);
  log(`[reconcile] matched newsletter subscribers:    ${summary.matchedSubscribers}`);
  log(`[reconcile]   already reconciled:            ${summary.upToDate}`);
  log(`[reconcile]   checked this run:              ${summary.checked} (deferred ${summary.deferred})`);
  log(
    `[reconcile] classification: BOUNCE ${summary.classified.BOUNCE} / COMPLAINT ${summary.classified.COMPLAINT}` +
      ` / PROVIDER_SUPPRESSED ${summary.classified.PROVIDER_SUPPRESSED} (unverified ${summary.unverified})`,
  );
  log(`[reconcile] subscribers to change:          ${summary.plannedSubscriberChanges}`);
  log(`[reconcile] Resend Contacts to unsubscribe: ${summary.plannedContactChanges}`);
  for (const item of summary.items) {
    log(
      `  - ${item.maskedEmail} (${item.subscriberId.slice(0, 8)}) ${item.currentStatus} → ${item.newStatus}` +
        ` · ${item.reason}/${item.basis}${item.verified ? "" : " (unverified)"}` +
        ` · suppression ${item.effectiveReason}${item.contactChange ? " · Contact → unsubscribed" : ""}` +
        (item.result ? ` · ${item.result}` : ""),
    );
  }
  if (summary.mode === "apply") {
    log(`[reconcile] applied: updated ${summary.updated} / already ${summary.already} / not_found ${summary.notFound} / failed ${summary.failed}`);
  }
  if (summary.error) log(`[reconcile] ERROR: ${summary.error}`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (existsSync(options.envFile)) process.loadEnvFile(options.envFile);

  const missing = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "RESEND_API_KEY"].filter((key) => !process.env[key]);
  if (missing.length > 0) throw new Error(`Missing env: ${missing.join(", ")}`);

  console.log(`[reconcile] mode=${options.apply ? "APPLY (writes Supabase + Resend Contacts)" : "DRY-RUN (read-only)"}`);

  const db = createAdminClient();
  if (options.apply && (await isCampaignSending(db))) {
    console.error("[reconcile] a newsletter campaign is SENDING — re-run after it finishes");
    process.exitCode = 1;
    return;
  }

  const summary = await reconcileProviderSuppressions({
    store: createReconcileStore(db),
    client: createSuppressionsClient(),
    apply: options.apply,
    delayMs: options.delayMs,
  });
  printSummary(summary);

  if (options.apply && summary.changedSubscriberIds.length > 0) {
    const contacts = createContactsClient();
    let synced = 0;
    let failed = 0;
    for (const id of summary.changedSubscriberIds) {
      await sleep(options.delayMs);
      const { data, error } = await db.from("newsletter_subscribers").select(SUBSCRIBER_SYNC_COLUMNS).eq("id", id).maybeSingle();
      if (error || !data) {
        failed++;
        console.error(`[reconcile] Contact sync: subscriber ${id.slice(0, 8)} not readable`);
        continue;
      }
      const result = await syncSubscriberRow(data as SubscriberSyncRow, { db, client: contacts });
      if (result.ok) synced++;
      else {
        failed++;
        console.error(`[reconcile] Contact sync failed for ${id.slice(0, 8)}: ${redactEmails(result.error)}`);
      }
    }
    console.log(`[reconcile] Contact sync: ${synced} ok, ${failed} failed (failures stay queued for the contact-sync cron)`);
  }

  if (!summary.ok) process.exitCode = 1;
}

main().catch((err) => {
  console.error("[reconcile] aborted:", redactEmails(err instanceof Error ? err.message : String(err)));
  process.exitCode = 1;
});
