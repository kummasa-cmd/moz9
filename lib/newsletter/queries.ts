import { createAdminClient } from "@/lib/supabase/admin";
import type { ContentBlock } from "./blocks/types";
import type { AdBanner, Newsletter, NewsletterTemplate, Prospect, Subscriber, SubscriberSource } from "./types";

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

export type SubscribeResult =
  | { ok: true; alreadySubscribed: boolean }
  | { ok: false; error: string };

export async function subscribe(input: SubscribeInput): Promise<SubscribeResult> {
  const email = input.email.trim().toLowerCase();
  if (!email) return { ok: false, error: "이메일을 입력해 주세요." };

  const db = createAdminClient();

  const { data: existing } = await db
    .from("newsletter_subscribers")
    .select("id, status")
    .eq("email", email)
    .maybeSingle();

  if (existing) {
    if (existing.status === "SUBSCRIBED") {
      return { ok: true, alreadySubscribed: true };
    }

    const { error } = await db
      .from("newsletter_subscribers")
      .update({
        status: "SUBSCRIBED",
        subscribed_at: new Date().toISOString(),
        unsubscribed_at: null,
        name: input.name || undefined,
        member_id: input.memberId || undefined,
      })
      .eq("id", existing.id);

    if (error) return { ok: false, error: error.message };
    return { ok: true, alreadySubscribed: false };
  }

  const { error } = await db.from("newsletter_subscribers").insert({
    email,
    name: input.name || null,
    member_id: input.memberId || null,
    source: input.source,
    tags: input.tags ?? [],
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true, alreadySubscribed: false };
}

// Global do-not-contact list, shared by both the regular and promotional
// newsletter send paths (getTargetSubscribers / getTargetProspects below) —
// once an email lands here, nothing gets sent to it again either way.
async function addToSuppressionList(email: string): Promise<void> {
  const db = createAdminClient();
  await db
    .from("newsletter_suppressions")
    .upsert({ email }, { onConflict: "email", ignoreDuplicates: true });
}

async function getSuppressedEmailSet(): Promise<Set<string>> {
  const db = createAdminClient();
  const { data } = await db.from("newsletter_suppressions").select("email");
  return new Set((data ?? []).map((row) => row.email as string));
}

export type UnsubscribeResult = { ok: true; email: string } | { ok: false; error: string };

// A token may belong to a real subscriber or to a promotional-newsletter
// prospect — both use the same unsubscribe link/page, so this checks both
// tables and, either way, adds the email to newsletter_suppressions so no
// future newsletter (regular or promotional) is sent to it again.
export async function unsubscribeByToken(token: string): Promise<UnsubscribeResult> {
  const db = createAdminClient();

  const { data: subscriber, error } = await db
    .from("newsletter_subscribers")
    .update({ status: "UNSUBSCRIBED", unsubscribed_at: new Date().toISOString() })
    .eq("unsubscribe_token", token)
    .eq("status", "SUBSCRIBED")
    .select("email")
    .maybeSingle();

  if (error) return { ok: false, error: error.message };

  if (subscriber) {
    await addToSuppressionList(subscriber.email as string);
    return { ok: true, email: subscriber.email as string };
  }

  const { data: prospect } = await db
    .from("newsletter_prospects")
    .select("email")
    .eq("unsubscribe_token", token)
    .maybeSingle();

  if (prospect) {
    await addToSuppressionList(prospect.email as string);
    return { ok: true, email: prospect.email as string };
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
  let query = db.from("newsletter_subscribers").select(SUBSCRIBER_COLUMNS).eq("status", "SUBSCRIBED");

  if (!campaign.targetAll && campaign.targetTags.length > 0) {
    query = query.overlaps("tags", campaign.targetTags);
  }

  const [{ data }, suppressed] = await Promise.all([query, getSuppressedEmailSet()]);
  return (data ?? []).map(mapSubscriber).filter((s) => !suppressed.has(s.email));
}

// Recipients for a PROSPECTS-audience campaign (promotional newsletter) —
// every registered prospect, minus anyone who has unsubscribed since.
export async function getTargetProspects(): Promise<Prospect[]> {
  const db = createAdminClient();
  const [{ data }, suppressed] = await Promise.all([
    db.from("newsletter_prospects").select(PROSPECT_COLUMNS),
    getSuppressedEmailSet(),
  ]);
  return (data ?? []).map(mapProspect).filter((p) => !suppressed.has(p.email));
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
