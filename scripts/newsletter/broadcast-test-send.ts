/**
 * Manual Resend Broadcast test against the TEST segment only (3단계).
 *
 * Usage (from the project root):
 *   npx tsx scripts/newsletter/broadcast-test-send.ts --newsletter <id|slug> --segment <testSegmentId> --dry-run
 *   npx tsx scripts/newsletter/broadcast-test-send.ts --newsletter <id|slug> --segment <testSegmentId>
 *   npx tsx scripts/newsletter/broadcast-test-send.ts --newsletter <id|slug> --segment <testSegmentId> --send
 *   npx tsx scripts/newsletter/broadcast-test-send.ts ... --send --scheduled-at 2026-10-01T09:00:00+09:00
 *
 * Options:
 *   --newsletter X     Newsletter id or slug to render (read-only; REGULAR only).
 *   --segment ID       Required. Must equal RESEND_TEST_SEGMENT_ID and differ
 *                      from RESEND_NEWSLETTER_SEGMENT_ID.
 *   --dry-run          Render + validate only. No Resend calls at all.
 *   (default)          Create the Broadcast as a DRAFT only — nothing is sent;
 *                      review it in the Resend dashboard.
 *   --send             Create the draft, then send it to the test segment.
 *   --scheduled-at T   With --send: schedule instead of sending now
 *                      (ISO 8601 with zone, 1 minute to 30 days ahead).
 *   --max-contacts N   Abort if the test segment has more than N contacts (default 5).
 *   --env PATH         Env file to load (default .env.local).
 *
 * Never touches newsletter_campaigns / newsletter_deliveries /
 * newsletter_broadcast_sends, never assigns an issue number, and never
 * targets the real subscriber segment.
 */
import { existsSync } from "node:fs";
import { resolveBroadcastSegment } from "@/lib/newsletter/delivery-mode";
import {
  RESEND_UNSUBSCRIBE_PLACEHOLDER,
  buildBroadcastPayload,
  createBroadcastDraft,
  createBroadcastsClient,
  normalizeScheduledAt,
  redactSecrets,
  sendBroadcast,
} from "@/lib/newsletter/resend-broadcasts";

type Options = {
  newsletter: string;
  segment: string;
  dryRun: boolean;
  send: boolean;
  scheduledAt: string | null;
  maxContacts: number;
  envFile: string;
};

function parseArgs(argv: string[]): Options {
  const options: Options = {
    newsletter: "",
    segment: "",
    dryRun: false,
    send: false,
    scheduledAt: null,
    maxContacts: 5,
    envFile: ".env.local",
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--send") options.send = true;
    else if (arg === "--newsletter") options.newsletter = argv[++i] ?? "";
    else if (arg === "--segment") options.segment = argv[++i] ?? "";
    else if (arg === "--scheduled-at") options.scheduledAt = argv[++i] ?? "";
    else if (arg === "--env") options.envFile = argv[++i] ?? options.envFile;
    else if (arg === "--max-contacts") {
      const n = Number(argv[++i]);
      if (!Number.isInteger(n) || n < 1) throw new Error("--max-contacts needs a positive integer");
      options.maxContacts = n;
    } else throw new Error(`Unknown argument: ${arg}`);
  }

  if (!options.newsletter) throw new Error("--newsletter <id|slug> is required");
  if (!options.segment) throw new Error("--segment <testSegmentId> is required");
  if (options.scheduledAt !== null && !options.send) throw new Error("--scheduled-at needs --send");
  if (options.dryRun && options.send) throw new Error("--dry-run and --send can't be combined");
  return options;
}

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  return `${local.slice(0, 2)}***@${domain ?? ""}`;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (existsSync(options.envFile)) process.loadEnvFile(options.envFile);

  const required = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "NEWSLETTER_SENDER_EMAIL"];
  if (!options.dryRun) required.push("RESEND_API_KEY");
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) throw new Error(`Missing env: ${missing.join(", ")}`);

  const segment = resolveBroadcastSegment("test", process.env, options.segment);
  if (!segment.ok) throw new Error(segment.error);

  const schedule = normalizeScheduledAt(options.scheduledAt);
  if (!schedule.ok) throw new Error(schedule.error);

  // Loaded after the env file: config.ts reads process.env at import time.
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const { renderBroadcastHtml, newsletterFromAddress } = await import("@/lib/newsletter/broadcast-sender");

  const db = createAdminClient();
  const column = UUID.test(options.newsletter) ? "id" : "slug";
  const { data: newsletter, error } = await db
    .from("newsletters")
    .select("id, slug, subject, blocks, published_at, issue_number, newsletter_type")
    .eq(column, options.newsletter)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!newsletter) throw new Error(`Newsletter not found: ${options.newsletter}`);
  if (newsletter.newsletter_type !== "REGULAR") throw new Error("Only REGULAR newsletters can be Broadcast-tested.");

  const html = await renderBroadcastHtml(newsletter, (newsletter.issue_number as number | null) ?? null);
  const payload = buildBroadcastPayload({
    name: `[TEST] ${newsletter.subject} · ${new Date().toISOString()}`,
    segmentId: segment.segmentId,
    from: newsletterFromAddress(),
    subject: `[TEST] ${newsletter.subject}`,
    html,
  });
  if (!payload.ok) throw new Error(payload.error);

  const mode = options.dryRun ? "DRY-RUN (no Resend calls)" : options.send ? "SEND to test segment" : "DRAFT only";
  console.log(`[broadcast-test] mode=${mode}`);
  console.log(`  newsletter:  ${newsletter.slug} (${newsletter.id})`);
  console.log(`  segment:     ${segment.segmentId} (RESEND_TEST_SEGMENT_ID)`);
  console.log(`  from:        ${newsletterFromAddress()}`);
  console.log(`  subject:     [TEST] ${newsletter.subject}`);
  console.log(`  html:        ${html.length} chars, unsubscribe placeholder: ${html.includes(RESEND_UNSUBSCRIBE_PLACEHOLDER)}`);
  console.log(`  own pixel:   ${html.includes("/api/track/open/") ? "PRESENT (unexpected)" : "none"}`);
  console.log(`  own clicks:  ${html.includes("/api/track/click/") ? "PRESENT (unexpected)" : "none"}`);
  if (schedule.scheduledAt) console.log(`  scheduledAt: ${schedule.scheduledAt}`);
  if (options.dryRun) return;

  const client = createBroadcastsClient();

  // Last line of defence against a mislabelled segment: a test segment is
  // tiny, so refuse anything bigger than --max-contacts.
  const contacts = await client.contacts.list({ segmentId: segment.segmentId, limit: options.maxContacts + 1 });
  if (contacts.error) throw new Error(`Test segment lookup failed: ${contacts.error.name}: ${contacts.error.message}`);
  const list = contacts.data.data;
  if (list.length === 0) throw new Error("Test segment has no contacts — add 1-2 test addresses first.");
  if (list.length > options.maxContacts || contacts.data.has_more) {
    throw new Error(`Test segment has more than ${options.maxContacts} contacts — refusing. Is this really the test segment?`);
  }
  console.log(`  contacts:    ${list.map((c) => `${maskEmail(c.email)}${c.unsubscribed ? " (unsubscribed)" : ""}`).join(", ")}`);

  const draft = await createBroadcastDraft(client, payload.payload);
  if (!draft.ok) throw new Error(`Draft creation failed: ${draft.error}`);
  console.log(`[broadcast-test] draft created: ${draft.broadcastId}`);

  if (!options.send) {
    console.log("[broadcast-test] Not sent. Review it in Resend → Broadcasts, then re-run with --send (a new draft is created).");
    return;
  }

  const sent = await sendBroadcast(client, draft.broadcastId, { scheduledAt: schedule.scheduledAt });
  if (!sent.ok) throw new Error(`Send failed (draft ${draft.broadcastId} left in Resend): ${sent.error}`);
  console.log(
    `[broadcast-test] ${schedule.scheduledAt ? `scheduled for ${schedule.scheduledAt}` : "sent"}: ${sent.broadcastId}`,
  );
}

main().catch((err) => {
  console.error("[broadcast-test] fatal:", redactSecrets(err instanceof Error ? err.message : String(err)));
  process.exitCode = 1;
});
