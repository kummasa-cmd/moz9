import { createAdminClient } from "@/lib/supabase/admin";
import type { ContentBlock } from "./blocks/types";
import type { AdBanner, Newsletter, NewsletterTemplate, Prospect, Subscriber, SubscriberSource } from "./types";
import { fetchAllRows } from "./paginate";
import { isMissingFunctionError, mapSubscribeRpcRow, type SubscribeResult, type SubscribeRpcRow } from "./subscribe-flow";

const NEWSLETTER_COLUMNS =
  "id, title, slug, subject, preheader, thumbnail_url, status, newsletter_type, blocks, view_count, like_count, dislike_count, issue_number, published_at, created_at";

const AD_BANNER_COLUMNS = "id, name, image_url, link_url, position, start_date, end_date, is_active";

const SUBSCRIBER_COLUMNS =
  "id, email, name, member_id, source, status, tags, unsubscribe_token, subscribed_at, unsubscribed_at";

const PROSPECT_COLUMNS = "id, email, name, source, unsubscribe_token, created_at";

function mapNewsletter(row: Record<string, unknown>): Newsletter {
  return {
    id: row.id as string,
    title: row.title as string,
    slug: row.slug as string,
    subject: row.subject as string,
    preheader: (row.preheader as string | null) ?? null,
    thumbnailUrl: (row.thumbnail_url as string | null) ?? null,
    status: row.status as Newsletter["status"],
    newsletterType: (row.newsletter_type as Newsletter["newsletterType"] | null) ?? "REGULAR",
    blocks: (row.blocks as ContentBlock[] | null) ?? [],
    viewCount: (row.view_count as number | null) ?? 0,
    likeCount: (row.like_count as number | null) ?? 0,
    dislikeCount: (row.dislike_count as number | null) ?? 0,
    issueNumber: (row.issue_number as number | null) ?? null,
    publishedAt: (row.published_at as string | null) ?? null,
    createdAt: row.created_at as string,
  };
}

function mapProspect(row: Record<string, unknown>): Prospect {
  return {
    id: row.id as string,
    email: row.email as string,
    name: (row.name as string | null) ?? null,
    source: row.source as Prospect["source"],
    unsubscribeToken: row.unsubscribe_token as string,
    createdAt: row.created_at as string,
  };
}

function mapNewsletterTemplate(row: Record<string, unknown>): NewsletterTemplate {
  return {
    id: row.id as string,
    name: row.name as string,
    blocks: (row.blocks as ContentBlock[] | null) ?? [],
    createdAt: row.created_at as string,
  };
}

function mapAdBanner(row: Record<string, unknown>): AdBanner {
  return {
    id: row.id as string,
    name: row.name as string,
    imageUrl: row.image_url as string,
    linkUrl: row.link_url as string,
    position: row.position as AdBanner["position"],
    startDate: row.start_date as string,
    endDate: row.end_date as string,
    isActive: row.is_active as boolean,
  };
}

function mapSubscriber(row: Record<string, unknown>): Subscriber {
  return {
    id: row.id as string,
    email: row.email as string,
    name: (row.name as string | null) ?? null,
    memberId: (row.member_id as string | null) ?? null,
    source: row.source as Subscriber["source"],
    status: row.status as Subscriber["status"],
    tags: (row.tags as string[] | null) ?? [],
    unsubscribeToken: row.unsubscribe_token as string,
    subscribedAt: row.subscribed_at as string,
    unsubscribedAt: (row.unsubscribed_at as string | null) ?? null,
  };
}

// A newsletter can be status=PUBLISHED (web-visible) while its email campaign
// is still SCHEDULED/SENDING and hasn't actually gone out yet. Hide those from
// public listings until the first real send completes, so readers can't see
// content before subscribers do. Newsletters with no campaign (pure web
// posts) or a campaign that has sent at least once (including RECURRING/RANGE
// campaigns cycling back to SCHEDULED for their next run) stay visible.
async function filterOutUnsentScheduled(newsletters: Newsletter[]): Promise<Newsletter[]> {
  if (newsletters.length === 0) return newsletters;

  const db = createAdminClient();
  const { data: campaigns } = await db
    .from("newsletter_campaigns")
    .select("newsletter_id, status, total_sent, created_at")
    .in(
      "newsletter_id",
      newsletters.map((n) => n.id),
    )
    .order("created_at", { ascending: false });

  const latestCampaignByNewsletterId = new Map<string, { status: string; totalSent: number }>();
  for (const c of campaigns ?? []) {
    const newsletterId = c.newsletter_id as string;
    if (latestCampaignByNewsletterId.has(newsletterId)) continue;
    latestCampaignByNewsletterId.set(newsletterId, {
      status: c.status as string,
      totalSent: (c.total_sent as number | null) ?? 0,
    });
  }

  return newsletters.filter((n) => {
    const campaign = latestCampaignByNewsletterId.get(n.id);
    if (!campaign) return true;
    const stillPending = campaign.status === "SCHEDULED" || campaign.status === "SENDING";
    return !(stillPending && campaign.totalSent === 0);
  });
}

export async function getPublishedNewsletters(limit = 20): Promise<Newsletter[]> {
  const db = createAdminClient();
  const { data } = await db
    .from("newsletters")
    .select(NEWSLETTER_COLUMNS)
    .eq("status", "PUBLISHED")
    // Promotional newsletters are cold outreach aimed at growing the
    // subscriber base — they don't belong in the reader-facing archive.
    .eq("newsletter_type", "REGULAR")
    .order("published_at", { ascending: false });

  const visible = await filterOutUnsentScheduled((data ?? []).map(mapNewsletter));
  return visible.slice(0, limit);
}

export async function getPublishedNewsletterBySlug(slug: string): Promise<Newsletter | null> {
  const db = createAdminClient();
  const { data } = await db
    .from("newsletters")
    .select(NEWSLETTER_COLUMNS)
    .eq("slug", slug)
    .eq("status", "PUBLISHED")
    .maybeSingle();

  return data ? mapNewsletter(data) : null;
}

export async function recordNewsletterView(
  newsletterId: string,
  visitorId: string | null,
  referrer: string | null,
): Promise<void> {
  const db = createAdminClient();
  await db.from("newsletter_views").insert({
    newsletter_id: newsletterId,
    visitor_id: visitorId,
    referrer,
  });
  await db.rpc("increment_newsletter_view_count", { p_newsletter_id: newsletterId });
}

// Assigns the newsletter's issue number (발행호수) the first time it is
// actually published — see filterOutUnsentScheduled above for the "실제
// 발행" definition this must match. Idempotent: a newsletter that already has
// an issue number keeps it. Call sites: manage/actions.ts (pure web publish,
// no campaign) and scheduler.ts::processCampaign (first real email send).
export async function assignNewsletterIssueNumber(newsletterId: string): Promise<number | null> {
  const db = createAdminClient();
  const { data, error } = await db.rpc("assign_newsletter_issue_number", {
    p_newsletter_id: newsletterId,
  });
  if (error) return null;
  return data as number;
}

export async function getAdBannersByIds(ids: string[]): Promise<Record<string, AdBanner>> {
  if (ids.length === 0) return {};

  const db = createAdminClient();
  const { data } = await db.from("newsletter_ad_banners").select(AD_BANNER_COLUMNS).in("id", ids);

  const map: Record<string, AdBanner> = {};
  for (const row of data ?? []) map[row.id as string] = mapAdBanner(row);
  return map;
}

export type SubscribeInput = {
  email: string;
  name?: string;
  memberId?: string;
  source: SubscriberSource;
  tags?: string[];
};

export type { SubscribeResult };

// (Re)subscribe through the SQL function newsletter_subscribe (0029), which
// checks the suppression reason and changes the subscriber row and the
// suppression list in one locked transaction:
//   UNSUBSCRIBE suppression        → lifted, row back to SUBSCRIBED
//   COMPLAINT / BOUNCE / PROVIDER_SUPPRESSED, or BOUNCED / SUPPRESSED
//                                  → blocked, nothing changes (0030)
export async function subscribe(input: SubscribeInput): Promise<SubscribeResult> {
  const email = input.email.trim().toLowerCase();
  if (!email) return { ok: false, error: "이메일을 입력해 주세요." };

  const db = createAdminClient();
  const { data, error } = await db.rpc("newsletter_subscribe", {
    p_email: email,
    p_name: input.name ?? null,
    p_member_id: input.memberId ?? null,
    p_source: input.source,
    p_tags: input.tags ?? [],
  });

  // Until 0029 is applied the function doesn't exist; keep signups working
  // on the old path (no COMPLAINT / BOUNCE suppressions can exist yet then).
  if (isMissingFunctionError(error)) return subscribeWithoutSuppressionReasons(input);
  if (error) return { ok: false, error: error.message };

  return mapSubscribeRpcRow((Array.isArray(data) ? data[0] : data) as SubscribeRpcRow | null);
}

// Pre-0029 subscribe path. Only reached while newsletter_subscribe() is
// missing; remove once 0029 is applied everywhere.
async function subscribeWithoutSuppressionReasons(input: SubscribeInput): Promise<SubscribeResult> {
  const email = input.email.trim().toLowerCase();
  const db = createAdminClient();

  const { data: existing, error: lookupError } = await db
    .from("newsletter_subscribers")
    .select("id, status, resend_synced_at, resend_sync_error")
    .eq("email", email)
    .maybeSingle();

  if (lookupError) return { ok: false, error: lookupError.message };

  let alreadySubscribed = false;
  let subscriberId: string | null = (existing?.id as string | undefined) ?? null;
  // A status change always needs a Resend sync; an already-subscribed retry
  // only when the earlier sync never landed (so resubmits can't spam Resend).
  let needsContactSync = true;

  if (existing?.status === "SUBSCRIBED") {
    alreadySubscribed = true;
    needsContactSync = !existing.resend_synced_at || !!existing.resend_sync_error;
  } else if (existing) {
    const { error } = await db
      .from("newsletter_subscribers")
      .update({
        status: "SUBSCRIBED",
        subscribed_at: new Date().toISOString(),
        unsubscribed_at: null,
        name: input.name || undefined,
        member_id: input.memberId || undefined,
        // Marks the Resend Contact stale until the follow-up sync succeeds.
        resend_synced_at: null,
      })
      .eq("id", existing.id);

    if (error) return { ok: false, error: error.message };
  } else {
    const { data: inserted, error } = await db
      .from("newsletter_subscribers")
      .insert({
        email,
        name: input.name || null,
        member_id: input.memberId || null,
        source: input.source,
        tags: input.tags ?? [],
      })
      .select("id")
      .single();

    // 23505: a concurrent submit inserted the same email first — that
    // request owns the Resend sync.
    if (error?.code === "23505") {
      alreadySubscribed = true;
      needsContactSync = false;
    } else if (error) return { ok: false, error: error.message };
    else subscriberId = inserted.id as string;
  }

  // An explicit (re)subscribe is fresh consent, so it lifts any earlier
  // do-not-contact entry — otherwise getTargetSubscribers keeps filtering the
  // address out and a returning subscriber silently never gets mail. Also
  // runs on the already-subscribed path, so a retry heals a previous attempt
  // whose suppression delete failed.
  const { error: suppressionError } = await removeFromSuppressionList(email);
  if (suppressionError) return { ok: false, error: suppressionError.message };

  return { ok: true, alreadySubscribed, subscriberId, needsContactSync: needsContactSync && !!subscriberId };
}

// Global do-not-contact list, shared by both the regular and promotional
// newsletter send paths (getTargetSubscribers / getTargetProspects below) —
// once an email lands here, nothing gets sent to it again either way.
export async function addToSuppressionList(email: string): Promise<void> {
  const db = createAdminClient();
  await db
    .from("newsletter_suppressions")
    .upsert({ email }, { onConflict: "email", ignoreDuplicates: true });
}

export async function removeFromSuppressionList(email: string) {
  const db = createAdminClient();
  return db.from("newsletter_suppressions").delete().eq("email", email);
}

// Paged — an unpaged select stops at 1,000 rows, which would let every
// suppressed email past the first 1,000 receive newsletters again.
async function getSuppressedEmailSet(): Promise<Set<string>> {
  const db = createAdminClient();
  const rows = await fetchAllRows<{ email: string }>((from, to) =>
    db.from("newsletter_suppressions").select("email").order("id").range(from, to),
  );
  return new Set(rows.map((row) => row.email));
}

// Emails already subscribed to the regular newsletter — excluded from
// promotional sends too, since prospects are meant to be cold outreach to
// people who aren't subscribers yet (see getTargetProspects below).
async function getSubscribedEmailSet(): Promise<Set<string>> {
  const db = createAdminClient();
  const { data } = await db.from("newsletter_subscribers").select("email").eq("status", "SUBSCRIBED");
  return new Set((data ?? []).map((row) => row.email as string));
}

// subscriberId: the regular-newsletter subscriber whose Resend Contact must
// now be re-synced (the caller syncs only when present). Prospects aren't
// mirrored to Resend Contacts, but a prospect address can also be a
// subscriber — then that subscriber is returned too.
export type UnsubscribeResult =
  | { ok: true; email: string; subscriberId: string | null }
  | { ok: false; error: string };

// A token may belong to a real subscriber or to a promotional-newsletter
// prospect — both use the same unsubscribe link/page, so this checks both
// tables and, either way, adds the email to newsletter_suppressions so no
// future newsletter (regular or promotional) is sent to it again.
export async function unsubscribeByToken(token: string): Promise<UnsubscribeResult> {
  const db = createAdminClient();

  const { data: subscriber, error } = await db
    .from("newsletter_subscribers")
    .update({
      status: "UNSUBSCRIBED",
      unsubscribed_at: new Date().toISOString(),
      // Marks the Resend Contact stale until the follow-up sync succeeds.
      resend_synced_at: null,
    })
    .eq("unsubscribe_token", token)
    .eq("status", "SUBSCRIBED")
    .select("id, email")
    .maybeSingle();

  if (error) return { ok: false, error: error.message };

  if (subscriber) {
    await addToSuppressionList(subscriber.email as string);
    return { ok: true, email: subscriber.email as string, subscriberId: subscriber.id as string };
  }

  const { data: prospect } = await db
    .from("newsletter_prospects")
    .select("email")
    .eq("unsubscribe_token", token)
    .maybeSingle();

  if (prospect) {
    const email = prospect.email as string;
    await addToSuppressionList(email);

    // The same address may also be a SUBSCRIBED regular subscriber. The
    // suppression makes it ineligible, so its Resend Contact must become
    // unsubscribed too: mark it stale (retry queue) and hand it back for the
    // immediate sync. Status stays SUBSCRIBED — only the suppression changed,
    // same as before.
    const { data: alsoSubscriber, error: staleError } = await db
      .from("newsletter_subscribers")
      .update({ resend_synced_at: null })
      .eq("email", email)
      .eq("status", "SUBSCRIBED")
      .select("id")
      .maybeSingle();
    if (staleError) console.error("[newsletter] 구독자 Resend 동기화 표시 초기화 실패:", staleError.message);

    return { ok: true, email, subscriberId: (alsoSubscriber?.id as string | undefined) ?? null };
  }

  return { ok: false, error: "이미 처리되었거나 유효하지 않은 링크입니다." };
}

export async function getSubscriberByEmail(email: string): Promise<Subscriber | null> {
  const db = createAdminClient();
  const { data } = await db
    .from("newsletter_subscribers")
    .select(SUBSCRIBER_COLUMNS)
    .eq("email", email.trim().toLowerCase())
    .maybeSingle();

  return data ? mapSubscriber(data) : null;
}

export async function getTargetSubscribers(campaign: {
  targetAll: boolean;
  targetTags: string[];
}): Promise<Subscriber[]> {
  const db = createAdminClient();
  const filterByTags = !campaign.targetAll && campaign.targetTags.length > 0;

  const [rows, suppressed] = await Promise.all([
    fetchAllRows<Record<string, unknown>>((from, to) => {
      let query = db.from("newsletter_subscribers").select(SUBSCRIBER_COLUMNS).eq("status", "SUBSCRIBED");
      if (filterByTags) query = query.overlaps("tags", campaign.targetTags);
      return query.order("id").range(from, to);
    }),
    getSuppressedEmailSet(),
  ]);

  // A row inserted mid-paging can shift a later page and repeat a subscriber;
  // dedupe so nobody gets two copies (and the deliveries upsert, keyed on
  // subscriber_id, doesn't see the same row twice in one statement).
  const byId = new Map<string, Subscriber>();
  for (const row of rows) {
    const subscriber = mapSubscriber(row);
    if (!suppressed.has(subscriber.email)) byId.set(subscriber.id, subscriber);
  }
  return [...byId.values()];
}

// Recipients for a PROSPECTS-audience campaign (promotional newsletter) —
// every registered prospect, minus anyone who has unsubscribed since and
// minus anyone who is already a regular subscriber.
export async function getTargetProspects(): Promise<Prospect[]> {
  const db = createAdminClient();
  const [{ data }, suppressed, subscribed] = await Promise.all([
    db.from("newsletter_prospects").select(PROSPECT_COLUMNS),
    getSuppressedEmailSet(),
    getSubscribedEmailSet(),
  ]);
  return (data ?? [])
    .map(mapProspect)
    .filter((p) => !suppressed.has(p.email) && !subscribed.has(p.email));
}

const COLUMN_BOARD_SLUGS = ["column", "series", "info", "ad"];

export type BoardPostOption = {
  id: string;
  title: string;
  content: string;
  boardName: string;
  status: string;
  newsletterUseCount: number;
  newsletterLastUsedAt: string | null;
  createdAt: string;
  // Set only for posts written by a logged-in member (not an admin) — used to
  // prefix an author_info block when importing the post into a newsletter.
  author: { name: string; avatarUrl: string | null } | null;
};

export async function getColumnBoardPosts(): Promise<BoardPostOption[]> {
  const db = createAdminClient();

  const { data: boards } = await db.from("boards").select("id, name, slug").in("slug", COLUMN_BOARD_SLUGS);
  if (!boards || boards.length === 0) return [];

  const boardNameById = new Map(boards.map((b) => [b.id as string, b.name as string]));

  const { data: posts } = await db
    .from("board_posts")
    .select(
      "id, title, content, board_id, user_id, author, status, newsletter_use_count, newsletter_last_used_at, created_at",
    )
    .in(
      "board_id",
      boards.map((b) => b.id),
    )
    .order("newsletter_use_count", { ascending: true })
    .order("created_at", { ascending: false });

  const memberUserIds = [...new Set((posts ?? []).map((p) => p.user_id).filter((id): id is string => !!id))];

  const memberByUserId = new Map<string, { nickname: string | null; avatarUrl: string | null }>();
  if (memberUserIds.length > 0) {
    const { data: members } = await db
      .from("members")
      .select("user_id, nickname, avatar_url")
      .in("user_id", memberUserIds);
    for (const m of members ?? []) {
      memberByUserId.set(m.user_id as string, {
        nickname: (m.nickname as string | null) ?? null,
        avatarUrl: (m.avatar_url as string | null) ?? null,
      });
    }
  }

  return (posts ?? []).map((p) => {
    const userId = p.user_id as string | null;
    const member = userId ? memberByUserId.get(userId) : undefined;
    const authorText = p.author as string | null;

    return {
      id: p.id as string,
      title: p.title as string,
      content: p.content as string,
      boardName: boardNameById.get(p.board_id as string) ?? "",
      status: p.status as string,
      newsletterUseCount: (p.newsletter_use_count as number | null) ?? 0,
      newsletterLastUsedAt: (p.newsletter_last_used_at as string | null) ?? null,
      createdAt: p.created_at as string,
      // Member-authored posts get a profile (nickname + avatar); admin-entered
      // posts fall back to the free-text `author` field so every imported post
      // still carries visible attribution in the newsletter.
      author: userId
        ? { name: member?.nickname ?? "익명", avatarUrl: member?.avatarUrl ?? null }
        : authorText
          ? { name: authorText, avatarUrl: null }
          : null,
    };
  });
}

export async function recordBoardPostNewsletterUsage(postIds: string[]): Promise<void> {
  if (postIds.length === 0) return;
  const db = createAdminClient();
  await db.rpc("increment_board_post_newsletter_usage", { p_ids: postIds });
}

export async function recordNewsletterFeedback(
  newsletterId: string,
  type: "like" | "dislike",
): Promise<void> {
  const db = createAdminClient();
  await db.rpc("increment_newsletter_feedback", { p_newsletter_id: newsletterId, p_type: type });
}

// Per-post (게시물별) feedback — keyed by ContentBlock.sourcePostId, separate
// from the whole-newsletter like/dislike counters above.
export async function recordNewsletterPostFeedback(
  newsletterId: string,
  sourcePostId: string,
  type: "like" | "dislike",
): Promise<void> {
  const db = createAdminClient();
  await db.rpc("increment_newsletter_post_feedback", {
    p_newsletter_id: newsletterId,
    p_source_post_id: sourcePostId,
    p_type: type,
  });
}

export type PostFeedbackCounts = Record<string, { likeCount: number; dislikeCount: number }>;

export async function getNewsletterPostFeedbackCounts(newsletterId: string): Promise<PostFeedbackCounts> {
  const db = createAdminClient();
  const { data } = await db
    .from("newsletter_post_feedback")
    .select("source_post_id, like_count, dislike_count")
    .eq("newsletter_id", newsletterId);

  const counts: PostFeedbackCounts = {};
  for (const row of data ?? []) {
    counts[row.source_post_id as string] = {
      likeCount: (row.like_count as number | null) ?? 0,
      dislikeCount: (row.dislike_count as number | null) ?? 0,
    };
  }
  return counts;
}

export async function getNewsletterTemplates(): Promise<NewsletterTemplate[]> {
  const db = createAdminClient();
  const { data } = await db
    .from("newsletter_templates")
    .select("id, name, blocks, created_at")
    .order("created_at", { ascending: false });

  return (data ?? []).map(mapNewsletterTemplate);
}
