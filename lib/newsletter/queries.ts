import { createAdminClient } from "@/lib/supabase/admin";
import type { ContentBlock } from "./blocks/types";
import type { AdBanner, Newsletter, Subscriber, SubscriberSource } from "./types";

const NEWSLETTER_COLUMNS =
  "id, title, slug, subject, preheader, thumbnail_url, status, blocks, view_count, published_at, created_at";

const AD_BANNER_COLUMNS = "id, name, image_url, link_url, position, start_date, end_date, is_active";

const SUBSCRIBER_COLUMNS =
  "id, email, name, member_id, source, status, tags, unsubscribe_token, subscribed_at, unsubscribed_at";

function mapNewsletter(row: Record<string, unknown>): Newsletter {
  return {
    id: row.id as string,
    title: row.title as string,
    slug: row.slug as string,
    subject: row.subject as string,
    preheader: (row.preheader as string | null) ?? null,
    thumbnailUrl: (row.thumbnail_url as string | null) ?? null,
    status: row.status as Newsletter["status"],
    blocks: (row.blocks as ContentBlock[] | null) ?? [],
    viewCount: (row.view_count as number | null) ?? 0,
    publishedAt: (row.published_at as string | null) ?? null,
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

export async function getPublishedNewsletters(limit = 20): Promise<Newsletter[]> {
  const db = createAdminClient();
  const { data } = await db
    .from("newsletters")
    .select(NEWSLETTER_COLUMNS)
    .eq("status", "PUBLISHED")
    .order("published_at", { ascending: false })
    .limit(limit);

  return (data ?? []).map(mapNewsletter);
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

export type UnsubscribeResult = { ok: true; email: string } | { ok: false; error: string };

export async function unsubscribeByToken(token: string): Promise<UnsubscribeResult> {
  const db = createAdminClient();

  const { data, error } = await db
    .from("newsletter_subscribers")
    .update({ status: "UNSUBSCRIBED", unsubscribed_at: new Date().toISOString() })
    .eq("unsubscribe_token", token)
    .eq("status", "SUBSCRIBED")
    .select("email")
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "이미 처리되었거나 유효하지 않은 링크입니다." };
  return { ok: true, email: data.email as string };
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

  const { data } = await query;
  return (data ?? []).map(mapSubscriber);
}
