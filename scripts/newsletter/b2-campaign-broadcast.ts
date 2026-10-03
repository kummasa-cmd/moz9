/**
 * B2 — Production campaign-path Broadcast E2E, TEST segment only.
 *
 * Unlike broadcast-test-send.ts (which calls the Resend Broadcast API
 * directly), this sends a real campaign through
 *   processCampaign() → claimCampaign() → sendClaimedTestCampaignViaBroadcast()
 * so newsletter_campaigns / newsletter_broadcast_sends / the webhook linkage
 * are exercised exactly as a real Broadcast campaign would be. See
 * lib/newsletter/broadcast-test-run.ts for the isolation rules.
 *
 * Usage (from the project root):
 *   npx tsx scripts/newsletter/b2-campaign-broadcast.ts --segment <testSegmentId>
 *   npx tsx scripts/newsletter/b2-campaign-broadcast.ts --segment <testSegmentId> \
 *     --send --confirm-project <supabaseProjectRef> --expect-recipients <N>
 *
 * Options:
 *   --segment ID             Required. Must equal RESEND_TEST_SEGMENT_ID and
 *                            differ from RESEND_NEWSLETTER_SEGMENT_ID.
 *   (default)                DRY-RUN: reads only. Any non-GET request is
 *                            refused at the fetch level, so nothing can be
 *                            written to Supabase or Resend.
 *   --send                   Create one DRAFT test newsletter and one campaign
 *                            (SCHEDULED for 2099, so send-due never takes it),
 *                            then hand it to processCampaign({ broadcastTest }).
 *   --confirm-project REF    Required with --send: the Supabase project ref the
 *                            env points at (printed by the dry-run).
 *   --expect-recipients N    Required with --send: the subscribed Contact count
 *                            the dry-run printed. Re-checked right before send.
 *   --env PATH               Env file to load (default .env.local).
 *
 * NEWSLETTER_DELIVERY_MODE is not read or changed: B2 forces the Broadcast
 * path for this one invocation only.
 */
import { existsSync } from "node:fs";

type Options = {
  segment: string;
  send: boolean;
  confirmProject: string | null;
  expectRecipients: number | null;
  envFile: string;
};

function parseArgs(argv: string[]): Options {
  const options: Options = { segment: "", send: false, confirmProject: null, expectRecipients: null, envFile: ".env.local" };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--send") options.send = true;
    else if (arg === "--segment") options.segment = argv[++i] ?? "";
    else if (arg === "--confirm-project") options.confirmProject = argv[++i] ?? "";
    else if (arg === "--expect-recipients") {
      const n = Number(argv[++i]);
      if (!Number.isInteger(n) || n < 1) throw new Error("--expect-recipients needs a positive integer");
      options.expectRecipients = n;
    } else if (arg === "--env") options.envFile = argv[++i] ?? options.envFile;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!options.segment) throw new Error("--segment <testSegmentId> is required");
  if (options.send && (!options.confirmProject || options.expectRecipients === null)) {
    throw new Error("--send needs --confirm-project <ref> and --expect-recipients <N> (both printed by the dry-run)");
  }
  if (!options.send && (options.confirmProject !== null || options.expectRecipients !== null)) {
    throw new Error("--confirm-project / --expect-recipients only apply with --send");
  }
  return options;
}

// Dry-run guard: refuses every non-GET request before it leaves the process.
// Supabase selects and the Resend list endpoints are GETs; inserts, updates,
// RPCs and every Resend write are not.
function installReadOnlyFetch(): { blocked: () => number } {
  const original = globalThis.fetch;
  let blocked = 0;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    if (method !== "GET" && method !== "HEAD") {
      blocked++;
      throw new Error(`[b2] dry-run: blocked ${method} request`);
    }
    return original(input, init);
  }) as typeof fetch;
  return { blocked: () => blocked };
}

function projectRef(url: string | undefined): string {
  if (!url) return "(unset)";
  try {
    return new URL(url).hostname.split(".")[0];
  } catch {
    return "(invalid)";
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (existsSync(options.envFile)) process.loadEnvFile(options.envFile);

  const missing = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "RESEND_API_KEY", "NEWSLETTER_SENDER_EMAIL"].filter(
    (key) => !process.env[key],
  );
  if (missing.length > 0) throw new Error(`Missing env: ${missing.join(", ")}`);

  const guard = options.send ? null : installReadOnlyFetch();

  // Loaded after the env file: config.ts reads process.env at import time.
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const { createBroadcastsClient } = await import("@/lib/newsletter/resend-broadcasts");
  const { resolveDeliveryMode } = await import("@/lib/newsletter/delivery-mode");
  const { describePreflightIssues } = await import("@/lib/newsletter/broadcast-preflight");
  const b2 = await import("@/lib/newsletter/broadcast-test-run");

  const db = createAdminClient();
  const client = createBroadcastsClient();
  const target = { segmentId: options.segment };
  const ref = projectRef(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..*$/, "");

  const printPlan = (plan: Awaited<ReturnType<typeof b2.planBroadcastTestRun>>) => {
    console.log(`  supabase project:     ${ref}`);
    console.log(`  test segment:         ${plan.segmentId ?? "(rejected)"}`);
    console.log(`  operating segment:    ${plan.operatingSegmentId ? `${plan.operatingSegmentId.slice(0, 8)}… (different: ${plan.operatingSegmentId !== plan.segmentId})` : "(unset)"}`);
    console.log(`  global delivery mode: ${resolveDeliveryMode()} (not used by B2)`);
    console.log(`  B2 delivery path:     ${plan.deliveryPath ?? "(none)"}`);
    console.log(`  segment contacts:     ${plan.contacts.length}`);
    for (const c of plan.contacts) console.log(`    - ${c.maskedEmail} contact ${c.contactId.slice(0, 8)} ${c.unsubscribed ? "unsubscribed" : "subscribed"}`);
    if (plan.preflight) {
      const p = plan.preflight;
      console.log(`  preflight (segment):  ok=${p.ok} subscribed=${p.segmentSubscribed} blocking=[${describePreflightIssues(p.blocking)}] warnings=[${describePreflightIssues(p.warnings)}]`);
      console.log(`  suppression overlap:  ${p.blocking.find((i) => i.code === "RESEND_SUPPRESSED_BUT_SUBSCRIBED")?.count ?? 0}${p.blocking.some((i) => i.code === "SUPPRESSION_READ_FAILED") ? " (suppression list unreadable)" : ""}`);
    }
    console.log(`  SENDING campaigns:    ${plan.sendingCampaigns}`);
    console.log(`  expected recipients:  ${plan.expectedRecipients ?? "(n/a)"}`);
    const campaign = b2.broadcastTestCampaignRow("<new newsletter id>", stamp);
    console.log(
      `  campaign on --send:   audience=${campaign.audience} target_all=${campaign.target_all} tags=${campaign.target_tags.length} send_type=${campaign.send_type} scheduled_at=${campaign.scheduled_at} status=${campaign.status}`,
    );
    const newsletter = b2.broadcastTestNewsletterRow(stamp);
    console.log(`  newsletter on --send: status=${newsletter.status} type=${newsletter.newsletter_type} published_at=null issue_number=none slug=${newsletter.slug}`);
    for (const e of plan.errors) console.log(`  ERROR: ${e}`);
  };

  console.log(`[b2] mode=${options.send ? "SEND" : "DRY-RUN (read-only, non-GET blocked)"}`);
  const plan = await b2.planBroadcastTestRun(db, client, target);
  printPlan(plan);

  if (!options.send) {
    console.log(`[b2] send=false · non-GET requests blocked: ${guard?.blocked() ?? 0}`);
    if (!plan.ok) process.exitCode = 1;
    return;
  }

  // --send: every check again, against what the operator confirmed.
  if (!plan.ok) throw new Error("plan has errors — nothing created");
  if (options.confirmProject !== ref) throw new Error(`--confirm-project ${options.confirmProject} ≠ env project ${ref} — nothing created`);
  if (plan.expectedRecipients !== options.expectRecipients) {
    throw new Error(`test segment now has ${plan.expectedRecipients} subscribed Contacts, --expect-recipients said ${options.expectRecipients} — nothing created`);
  }

  const { processCampaign } = await import("@/lib/newsletter/scheduler");

  const { data: newsletter, error: newsletterError } = await db
    .from("newsletters")
    .insert(b2.broadcastTestNewsletterRow(stamp))
    .select("id")
    .single();
  if (newsletterError) throw new Error(`test newsletter insert failed: ${newsletterError.message}`);

  const { data: campaign, error: campaignError } = await db
    .from("newsletter_campaigns")
    .insert(b2.broadcastTestCampaignRow(newsletter.id as string, stamp))
    .select("id")
    .single();
  if (campaignError) throw new Error(`test campaign insert failed (newsletter ${newsletter.id} left as DRAFT): ${campaignError.message}`);
  const campaignId = campaign.id as string;
  console.log(`[b2] created newsletter ${newsletter.id} (DRAFT) and campaign ${campaignId} (SCHEDULED ${b2.BROADCAST_TEST_SCHEDULED_AT})`);

  // The segment-scoped preflight runs again inside, right before the run row
  // is reserved and the Broadcast created.
  const result = await processCampaign(campaignId, { trigger: "manual", broadcastTest: target });
  console.log(`[b2] processCampaign: ${JSON.stringify(result)}`);

  if (!result.ok) {
    // A pre-claim rejection leaves the campaign SCHEDULED (for 2099) — retire it.
    await db.from("newsletter_campaigns").update({ status: "CANCELLED", last_error: result.error }).eq("id", campaignId).eq("status", "SCHEDULED");
  }

  const { data: row } = await db
    .from("newsletter_campaigns")
    .select("status, total_recipients, total_sent, total_failed, last_error, sending_started_at, sent_at")
    .eq("id", campaignId)
    .single();
  const { data: runs } = await db
    .from("newsletter_broadcast_sends")
    .select("id, run_key, segment_id, resend_broadcast_id, status, recipient_estimate, last_error")
    .eq("campaign_id", campaignId);
  console.log(`[b2] campaign: ${JSON.stringify(row)}`);
  console.log(`[b2] broadcast_sends: ${JSON.stringify(runs)}`);
  if (!result.ok) process.exitCode = 1;
}

main().catch(async (err) => {
  const { redactSecrets } = await import("@/lib/newsletter/resend-broadcasts").catch(() => ({ redactSecrets: (s: string) => s }));
  console.error("[b2] fatal:", redactSecrets(err instanceof Error ? err.message : String(err)));
  process.exitCode = 1;
});
