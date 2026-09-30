import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

// Runs the real 0029 migration on an in-process Postgres (PGlite) and tests
// its functions: the site (re)subscribe rules and the webhook opt-out, and
// how the two interleave. Row locks serialize the two paths in production,
// so every race comes down to one of the orderings tested here.

const MIGRATION = readFileSync(join(process.cwd(), "supabase/migrations/0029_newsletter_resend_webhook_events.sql"), "utf8");

// Just enough of the existing schema (0005 / 0024 / 0027 / 0028) for 0029.
const PREREQUISITES = `
  create role anon; create role authenticated; create role service_role;
  create table public.newsletters (id uuid primary key default gen_random_uuid());
  create table public.newsletter_campaigns (id uuid primary key default gen_random_uuid());
  create table public.newsletter_subscribers (
    id uuid primary key default gen_random_uuid(),
    email text not null unique,
    name text,
    member_id uuid,
    source text not null default 'MANUAL',
    status text not null default 'SUBSCRIBED' check (status in ('SUBSCRIBED', 'UNSUBSCRIBED', 'BOUNCED')),
    tags text[] not null default '{}',
    subscribed_at timestamptz not null default now(),
    unsubscribed_at timestamptz,
    resend_contact_id text,
    resend_synced_at timestamptz,
    resend_sync_error text
  );
  create table public.newsletter_suppressions (
    id uuid primary key default gen_random_uuid(),
    email text not null unique,
    unsubscribed_at timestamptz not null default now()
  );
  create table public.newsletter_broadcast_sends (
    id uuid primary key default gen_random_uuid(),
    campaign_id uuid not null references public.newsletter_campaigns (id),
    newsletter_id uuid not null references public.newsletters (id),
    run_key text not null,
    resend_broadcast_id text unique,
    recipient_estimate int
  );
`;

let db: PGlite;

before(async () => {
  db = new PGlite();
  await db.exec(PREREQUISITES);
  await db.exec(MIGRATION);
  // Safe to run more than once.
  await db.exec(MIGRATION);
});

after(async () => {
  await db.close();
});

beforeEach(async () => {
  await db.exec("delete from public.newsletter_suppressions; delete from public.newsletter_subscribers;");
});

type SubscribeRow = { result: string; subscriber_id: string | null; needs_contact_sync: boolean };

async function subscribe(email: string, name: string | null = null): Promise<SubscribeRow> {
  const { rows } = await db.query<SubscribeRow>("select * from public.newsletter_subscribe($1, $2, null, 'WEBSITE', '{}')", [email, name]);
  return rows[0];
}

async function optOut(email: string, status: string, reason: string, eventAt: string | null = null, contactId: string | null = null) {
  const { rows } = await db.query<{ outcome: string; subscriber_id: string | null }>(
    "select * from public.newsletter_apply_resend_opt_out($1, $2, $3, $4, $5)",
    [email, status, reason, eventAt, contactId],
  );
  return rows[0];
}

async function subscriberRow(email: string) {
  const { rows } = await db.query<{
    status: string;
    subscribed_at: Date;
    unsubscribed_at: Date | null;
    resend_synced_at: Date | null;
    resend_contact_id: string | null;
    name: string | null;
  }>("select status, subscribed_at, unsubscribed_at, resend_synced_at, resend_contact_id, name from public.newsletter_subscribers where email = $1", [email]);
  return rows[0] ?? null;
}

async function suppression(email: string): Promise<string | null> {
  const { rows } = await db.query<{ reason: string }>("select reason from public.newsletter_suppressions where email = $1", [email]);
  return rows[0]?.reason ?? null;
}

async function seed(email: string, status: string, subscribedAt = "2026-09-01T00:00:00Z", suppressionReason: string | null = null) {
  await db.query(
    "insert into public.newsletter_subscribers (email, status, subscribed_at, resend_synced_at, resend_contact_id) values ($1, $2, $3, now(), 'c_1')",
    [email, status, subscribedAt],
  );
  if (suppressionReason) {
    await db.query("insert into public.newsletter_suppressions (email, reason) values ($1, $2)", [email, suppressionReason]);
  }
}

describe("migration 0029", () => {
  it("defaults existing suppressions to UNSUBSCRIBE and rejects unknown reasons", async () => {
    await db.query("insert into public.newsletter_suppressions (email) values ('old@example.com')");
    assert.equal(await suppression("old@example.com"), "UNSUBSCRIBE");
    await assert.rejects(db.query("insert into public.newsletter_suppressions (email, reason) values ('x@example.com', 'SPAM')"));
  });

  it("keeps the functions away from anon / authenticated", async () => {
    const { rows } = await db.query<{ anon: boolean; authenticated: boolean; service: boolean }>(`
      select has_function_privilege('anon', 'public.newsletter_subscribe(text, text, uuid, text, text[])', 'execute') as anon,
             has_function_privilege('authenticated', 'public.newsletter_apply_resend_opt_out(text, text, text, timestamptz, text)', 'execute') as authenticated,
             has_function_privilege('service_role', 'public.newsletter_subscribe(text, text, uuid, text, text[])', 'execute') as service`);
    assert.deepEqual(rows[0], { anon: false, authenticated: false, service: true });
  });
});

describe("newsletter_subscribe (site re-subscribe rules)", () => {
  it("subscribes a new email", async () => {
    const result = await subscribe(" New@Example.com ", "새 구독자");
    assert.equal(result.result, "created");
    assert.equal(result.needs_contact_sync, true);
    const row = await subscriberRow("new@example.com");
    assert.equal(row?.status, "SUBSCRIBED");
    assert.equal(row?.name, "새 구독자");
  });

  it("an UNSUBSCRIBE suppression is lifted by an explicit re-subscribe", async () => {
    await seed("u@example.com", "UNSUBSCRIBED", "2026-09-01T00:00:00Z", "UNSUBSCRIBE");
    const result = await subscribe("u@example.com");
    assert.equal(result.result, "reactivated");
    assert.equal(result.needs_contact_sync, true);
    const row = await subscriberRow("u@example.com");
    assert.equal(row?.status, "SUBSCRIBED");
    assert.equal(row?.unsubscribed_at, null);
    assert.equal(row?.resend_synced_at, null, "marked for Contact sync");
    assert.ok(row!.subscribed_at.getTime() > new Date("2026-09-01T00:00:00Z").getTime());
    assert.equal(await suppression("u@example.com"), null);
  });

  for (const reason of ["COMPLAINT", "BOUNCE"]) {
    it(`a ${reason} suppression blocks re-subscribe and leaves everything as it was`, async () => {
      await seed("b@example.com", "UNSUBSCRIBED", "2026-09-01T00:00:00Z", reason);
      const before = await subscriberRow("b@example.com");
      const result = await subscribe("b@example.com", "새 이름");
      assert.deepEqual(result, { result: "blocked", subscriber_id: null, needs_contact_sync: false });
      assert.deepEqual(await subscriberRow("b@example.com"), before);
      assert.equal(await suppression("b@example.com"), reason);
    });
  }

  it("a BOUNCED subscriber can't re-subscribe even without a suppression row", async () => {
    await seed("hb@example.com", "BOUNCED");
    assert.equal((await subscribe("hb@example.com")).result, "blocked");
    assert.equal((await subscriberRow("hb@example.com"))?.status, "BOUNCED");
  });

  it("a COMPLAINT-suppressed address with no subscriber row (e.g. a prospect) can't sign up", async () => {
    await db.query("insert into public.newsletter_suppressions (email, reason) values ('p@example.com', 'COMPLAINT')");
    assert.equal((await subscribe("p@example.com")).result, "blocked");
    assert.equal(await subscriberRow("p@example.com"), null);
  });

  it("an UNSUBSCRIBE-suppressed address with no subscriber row (promo opt-out) can sign up", async () => {
    await db.query("insert into public.newsletter_suppressions (email, reason) values ('p2@example.com', 'UNSUBSCRIBE')");
    assert.equal((await subscribe("p2@example.com")).result, "created");
    assert.equal(await suppression("p2@example.com"), null);
  });

  it("an already subscribed email only asks for a sync when the last one didn't land", async () => {
    await seed("s@example.com", "SUBSCRIBED");
    assert.deepEqual(await subscribe("s@example.com"), {
      result: "already",
      subscriber_id: (await db.query<{ id: string }>("select id from public.newsletter_subscribers where email='s@example.com'")).rows[0].id,
      needs_contact_sync: false,
    });
  });
});

describe("newsletter_apply_resend_opt_out (webhook)", () => {
  it("a Resend-side unsubscribe moves SUBSCRIBED → UNSUBSCRIBED and suppresses", async () => {
    await seed("w@example.com", "SUBSCRIBED");
    const result = await optOut("W@example.com", "UNSUBSCRIBED", "UNSUBSCRIBE", "2026-10-01T00:00:00Z", "c_new");
    assert.equal(result.outcome, "updated");
    const row = await subscriberRow("w@example.com");
    assert.equal(row?.status, "UNSUBSCRIBED");
    assert.ok(row?.unsubscribed_at);
    assert.ok(row?.resend_synced_at, "Resend already has unsubscribed=true");
    assert.equal(row?.resend_contact_id, "c_1", "an existing contact id is kept");
    assert.equal(await suppression("w@example.com"), "UNSUBSCRIBE");
  });

  it("a repeated unsubscribe is idempotent", async () => {
    await seed("w@example.com", "SUBSCRIBED");
    await optOut("w@example.com", "UNSUBSCRIBED", "UNSUBSCRIBE", "2026-10-01T00:00:00Z");
    const again = await optOut("w@example.com", "UNSUBSCRIBED", "UNSUBSCRIBE", "2026-10-01T00:00:00Z");
    assert.equal(again.outcome, "already");
    assert.equal((await db.query("select * from public.newsletter_suppressions")).rows.length, 1);
  });

  it("a Resend-side unsubscribe of an unknown address changes nothing", async () => {
    assert.equal((await optOut("ghost@example.com", "UNSUBSCRIBED", "UNSUBSCRIBE")).outcome, "not_found");
    assert.equal(await suppression("ghost@example.com"), null);
  });

  it("a complaint for an unknown address still suppresses it", async () => {
    assert.equal((await optOut("ghost@example.com", "UNSUBSCRIBED", "COMPLAINT")).outcome, "not_found");
    assert.equal(await suppression("ghost@example.com"), "COMPLAINT");
  });

  it("a permanent bounce marks BOUNCED without unsubscribed_at and flags the Contact for sync", async () => {
    await seed("pb@example.com", "SUBSCRIBED");
    await optOut("pb@example.com", "BOUNCED", "BOUNCE", "2026-10-01T00:00:00Z");
    const row = await subscriberRow("pb@example.com");
    assert.equal(row?.status, "BOUNCED");
    assert.equal(row?.unsubscribed_at, null);
    assert.equal(row?.resend_synced_at, null);
    assert.equal(await suppression("pb@example.com"), "BOUNCE");
  });

  it("upgrades a suppression reason but never downgrades it", async () => {
    await seed("r@example.com", "UNSUBSCRIBED", "2026-09-01T00:00:00Z", "UNSUBSCRIBE");
    await optOut("r@example.com", "UNSUBSCRIBED", "COMPLAINT");
    assert.equal(await suppression("r@example.com"), "COMPLAINT");
    await optOut("r@example.com", "BOUNCED", "BOUNCE");
    await optOut("r@example.com", "UNSUBSCRIBED", "UNSUBSCRIBE");
    assert.equal(await suppression("r@example.com"), "COMPLAINT");
  });

  it("rejects unknown status / reason values", async () => {
    await assert.rejects(optOut("x@example.com", "SUBSCRIBED", "UNSUBSCRIBE"));
    await assert.rejects(optOut("x@example.com", "UNSUBSCRIBED", "SPAM"));
  });
});

describe("webhook unsubscribe vs site re-subscribe (race orderings)", () => {
  // T1 = when the user clicked Resend's unsubscribe link (event created_at)
  // T2 = when the user re-subscribed on the site (subscribed_at)

  it("webhook applied first, then re-subscribe: the later re-subscribe wins", async () => {
    await seed("race@example.com", "SUBSCRIBED");
    await optOut("race@example.com", "UNSUBSCRIBED", "UNSUBSCRIBE", "2026-10-01T00:00:00Z");
    assert.equal((await subscribe("race@example.com")).result, "reactivated");
    assert.equal((await subscriberRow("race@example.com"))?.status, "SUBSCRIBED");
    assert.equal(await suppression("race@example.com"), null);
  });

  it("an old unsubscribe webhook arriving after a newer re-subscribe doesn't overwrite it", async () => {
    // Unsubscribed on the site earlier, re-subscribed now (T2 = now()); the
    // Resend unsubscribe event is from before that.
    await seed("race@example.com", "UNSUBSCRIBED", "2026-09-01T00:00:00Z", "UNSUBSCRIBE");
    await subscribe("race@example.com");
    const result = await optOut("race@example.com", "UNSUBSCRIBED", "UNSUBSCRIBE", "2026-09-15T00:00:00Z");
    assert.equal(result.outcome, "stale");
    assert.equal((await subscriberRow("race@example.com"))?.status, "SUBSCRIBED");
    assert.equal(await suppression("race@example.com"), null, "no stray suppression left behind");
  });

  it("an unsubscribe newer than the re-subscribe is applied", async () => {
    await seed("race@example.com", "UNSUBSCRIBED", "2026-09-01T00:00:00Z", "UNSUBSCRIBE");
    await subscribe("race@example.com");
    const future = new Date(Date.now() + 60_000).toISOString();
    assert.equal((await optOut("race@example.com", "UNSUBSCRIBED", "UNSUBSCRIBE", future)).outcome, "updated");
    assert.equal((await subscriberRow("race@example.com"))?.status, "UNSUBSCRIBED");
    assert.equal(await suppression("race@example.com"), "UNSUBSCRIBE");
  });

  it("a webhook that saw the row UNSUBSCRIBED, then a re-subscribe: no suppression survives on a SUBSCRIBED row", async () => {
    // Webhook first ('already' → adds UNSUBSCRIBE), re-subscribe second
    // (removes it) — the lock makes these two whole steps, never interleaved.
    await seed("race@example.com", "UNSUBSCRIBED");
    assert.equal((await optOut("race@example.com", "UNSUBSCRIBED", "UNSUBSCRIBE", "2026-10-01T00:00:00Z")).outcome, "already");
    await subscribe("race@example.com");
    assert.equal((await subscriberRow("race@example.com"))?.status, "SUBSCRIBED");
    assert.equal(await suppression("race@example.com"), null);
  });

  it("a complaint that arrives after a re-subscribe still wins, whatever the timestamps", async () => {
    await seed("c@example.com", "UNSUBSCRIBED", "2026-09-01T00:00:00Z", "UNSUBSCRIBE");
    await subscribe("c@example.com");
    // Complaint event older than the re-subscribe.
    assert.equal((await optOut("c@example.com", "UNSUBSCRIBED", "COMPLAINT", "2026-09-15T00:00:00Z")).outcome, "updated");
    assert.equal((await subscriberRow("c@example.com"))?.status, "UNSUBSCRIBED");
    assert.equal(await suppression("c@example.com"), "COMPLAINT");
    // ... and the next re-subscribe attempt is blocked.
    assert.equal((await subscribe("c@example.com")).result, "blocked");
    assert.equal((await subscriberRow("c@example.com"))?.status, "UNSUBSCRIBED");
  });

  it("a permanent bounce followed by a re-subscribe attempt stays BOUNCED", async () => {
    await seed("hb@example.com", "SUBSCRIBED");
    await optOut("hb@example.com", "BOUNCED", "BOUNCE", "2026-10-01T00:00:00Z");
    assert.equal((await subscribe("hb@example.com")).result, "blocked");
    assert.equal((await subscriberRow("hb@example.com"))?.status, "BOUNCED");
    assert.equal(await suppression("hb@example.com"), "BOUNCE");
  });
});

describe("newsletter_broadcast_stats view", () => {
  it("counts unique vs total opens/clicks from PROCESSED events only", async () => {
    await db.exec(`
      insert into public.newsletters (id) values ('00000000-0000-0000-0000-000000000001');
      insert into public.newsletter_campaigns (id) values ('00000000-0000-0000-0000-000000000002');
      insert into public.newsletter_broadcast_sends (id, campaign_id, newsletter_id, run_key, resend_broadcast_id)
        values ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'once', 'b_1');
      insert into public.newsletter_webhook_events (svix_id, event_type, status, email_id, broadcast_send_id, metadata) values
        ('m1', 'email.delivered', 'PROCESSED', 'e1', '00000000-0000-0000-0000-000000000003', '{}'),
        ('m2', 'email.delivered', 'PROCESSED', 'e2', '00000000-0000-0000-0000-000000000003', '{}'),
        ('m3', 'email.opened', 'PROCESSED', 'e1', '00000000-0000-0000-0000-000000000003', '{}'),
        ('m4', 'email.opened', 'PROCESSED', 'e1', '00000000-0000-0000-0000-000000000003', '{}'),
        ('m5', 'email.opened', 'PROCESSED', 'e2', '00000000-0000-0000-0000-000000000003', '{}'),
        ('m6', 'email.clicked', 'PROCESSED', 'e1', '00000000-0000-0000-0000-000000000003', '{}'),
        ('m7', 'email.clicked', 'PROCESSED', 'e1', '00000000-0000-0000-0000-000000000003', '{}'),
        ('m8', 'email.bounced', 'PROCESSED', 'e3', '00000000-0000-0000-0000-000000000003', '{"bounce_type":"Permanent"}'),
        ('m9', 'email.bounced', 'PROCESSED', 'e4', '00000000-0000-0000-0000-000000000003', '{"bounce_type":"Transient"}'),
        ('m10', 'email.opened', 'FAILED', 'e3', '00000000-0000-0000-0000-000000000003', '{}');
    `);
    const { rows } = await db.query<Record<string, number>>(
      "select delivered, unique_opens, total_opens, unique_clicks, total_clicks, bounced, bounced_permanent from public.newsletter_broadcast_stats",
    );
    assert.deepEqual(
      Object.fromEntries(Object.entries(rows[0]).map(([k, v]) => [k, Number(v)])),
      { delivered: 2, unique_opens: 2, total_opens: 3, unique_clicks: 1, total_clicks: 2, bounced: 2, bounced_permanent: 1 },
    );
    await assert.rejects(
      db.query("insert into public.newsletter_webhook_events (svix_id, event_type) values ('m1', 'email.opened')"),
      "svix_id is unique",
    );
  });
});
