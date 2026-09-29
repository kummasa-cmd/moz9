/**
 * Backfill existing SUBSCRIBED newsletter subscribers into Resend Contacts (2단계).
 *
 * Usage (from the project root):
 *   npx tsx scripts/newsletter/backfill-resend-contacts.ts --dry-run
 *   npx tsx scripts/newsletter/backfill-resend-contacts.ts
 *
 * Options:
 *   --dry-run        Read-only: no Resend calls, no DB writes. Prints what would be synced.
 *   --limit N        Stop after N sync attempts (default: no limit).
 *   --delay-ms N     Pause between Resend-bound subscribers (default 600ms ≈ 1-2 req/s,
 *                    well under Resend's 10 req/s team limit shared with sending).
 *   --page-size N    Rows fetched per DB page (default 200).
 *   --force          Re-sync rows already marked synced (still never duplicates Contacts).
 *   --env PATH       Env file to load (default .env.local).
 *
 * Safe to run repeatedly: rows already in sync are skipped, and each sync
 * updates the existing Contact (by stored id, then by email) before creating
 * one, so no duplicate Contacts are made. 429s back off exponentially; a
 * failing subscriber is recorded in resend_sync_error and the run continues.
 * Aborts (without harm — just re-run later) while a campaign is SENDING.
 */
import { existsSync } from "node:fs";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRows } from "@/lib/newsletter/paginate";
import {
  SUBSCRIBER_SYNC_COLUMNS,
  createContactsClient,
  isCampaignSending,
  syncSubscriberRow,
  type SubscriberSyncRow,
} from "@/lib/newsletter/contact-sync";
import { redactEmails } from "@/lib/newsletter/resend-contacts";

type Options = {
  dryRun: boolean;
  limit: number;
  delayMs: number;
  pageSize: number;
  force: boolean;
  envFile: string;
};

function parseArgs(argv: string[]): Options {
  const options: Options = {
    dryRun: false,
    limit: Infinity,
    delayMs: 600,
    pageSize: 200,
    force: false,
    envFile: ".env.local",
  };

  const numberArg = (name: string, value: string | undefined) => {
    const n = Number(value);
    if (!value || !Number.isFinite(n) || n < 0) throw new Error(`${name} needs a non-negative number`);
    return n;
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--force") options.force = true;
    else if (arg === "--limit") options.limit = numberArg(arg, argv[++i]);
    else if (arg === "--delay-ms") options.delayMs = numberArg(arg, argv[++i]);
    else if (arg === "--page-size") options.pageSize = Math.max(1, numberArg(arg, argv[++i]));
    else if (arg === "--env") options.envFile = argv[++i] ?? options.envFile;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  return `${local.slice(0, 2)}***@${domain ?? ""}`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (existsSync(options.envFile)) process.loadEnvFile(options.envFile);

  const required = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
  if (!options.dryRun) required.push("RESEND_API_KEY");
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) throw new Error(`Missing env: ${missing.join(", ")}`);

  console.log(
    `[backfill] mode=${options.dryRun ? "DRY-RUN (no Resend calls, no DB writes)" : "LIVE"}` +
      ` force=${options.force} delayMs=${options.delayMs} pageSize=${options.pageSize}` +
      ` limit=${Number.isFinite(options.limit) ? options.limit : "none"}` +
      ` segment=${process.env.RESEND_NEWSLETTER_SEGMENT_ID?.trim() || "(none)"}`,
  );

  const db = createAdminClient();
  const client = options.dryRun ? null : createContactsClient();

  const suppressed = new Set(
    (
      await fetchAllRows<{ email: string }>((from, to) =>
        db.from("newsletter_suppressions").select("email").order("id").range(from, to),
      )
    ).map((row) => row.email),
  );

  const counts = { scanned: 0, succeeded: 0, failed: 0, skipped: 0, wouldSync: 0 };
  let attempts = 0;
  let lastId: string | null = null;
  let aborted: string | null = null;

  outer: for (;;) {
    if (!options.dryRun && (await isCampaignSending(db))) {
      aborted = "a newsletter campaign is SENDING — re-run after it finishes";
      break;
    }

    // Keyset pagination on id: stable even though this loop updates the
    // rows it has already read.
    let query = db
      .from("newsletter_subscribers")
      .select(SUBSCRIBER_SYNC_COLUMNS)
      .eq("status", "SUBSCRIBED")
      .order("id", { ascending: true })
      .limit(options.pageSize);
    if (lastId) query = query.gt("id", lastId);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as SubscriberSyncRow[];
    if (rows.length === 0) break;
    lastId = rows[rows.length - 1].id;

    for (const row of rows) {
      counts.scanned++;

      if (!options.force && row.resend_synced_at && !row.resend_sync_error) {
        counts.skipped++;
        continue;
      }

      if (attempts >= options.limit) {
        aborted = `--limit ${options.limit} reached`;
        break outer;
      }
      attempts++;

      if (options.dryRun) {
        counts.wouldSync++;
        const action = row.resend_contact_id ? "update" : "update-or-create";
        const note = suppressed.has(row.email) ? " (suppressed → unsubscribed=true)" : "";
        console.log(`[dry-run] ${action} ${maskEmail(row.email)}${note}`);
        continue;
      }

      if (attempts > 1) await sleep(options.delayMs);

      const result = await syncSubscriberRow(row, {
        db,
        client: client!,
        suppressed: suppressed.has(row.email),
        retry: { maxRetries: 6, baseDelayMs: 1000, maxDelayMs: 60_000 },
      });

      if (result.ok) {
        counts.succeeded++;
        console.log(`[ok] ${maskEmail(row.email)} → ${result.contactId ?? "(no contact)"}`);
      } else {
        counts.failed++;
        console.log(`[fail] ${maskEmail(row.email)}: ${redactEmails(result.error)}`);
        if (/daily_quota_exceeded|monthly_quota_exceeded|invalid_api_key|missing_api_key|restricted_api_key/.test(result.error)) {
          aborted = `stopping on non-recoverable Resend error: ${result.error}`;
          break outer;
        }
      }
    }
  }

  console.log("");
  console.log("[backfill] summary");
  console.log(`  scanned (SUBSCRIBED rows): ${counts.scanned}`);
  if (options.dryRun) console.log(`  would sync:               ${counts.wouldSync}`);
  else {
    console.log(`  succeeded:                ${counts.succeeded}`);
    console.log(`  failed:                   ${counts.failed}`);
  }
  console.log(`  skipped (already synced): ${counts.skipped}`);
  if (aborted) console.log(`  stopped early:            ${aborted}`);

  if (counts.failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error("[backfill] fatal:", redactEmails(err instanceof Error ? err.message : String(err)));
  process.exitCode = 1;
});
