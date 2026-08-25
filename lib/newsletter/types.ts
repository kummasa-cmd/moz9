import type { ContentBlock } from "./blocks/types";

export type SubscriberSource = "WEBSITE" | "MEMBER_SIGNUP" | "IMPORT" | "MANUAL" | "CONTACT_FORM";
export type SubscriberStatus = "SUBSCRIBED" | "UNSUBSCRIBED" | "BOUNCED";

export type Subscriber = {
  id: string;
  email: string;
  name: string | null;
  memberId: string | null;
  source: SubscriberSource;
  status: SubscriberStatus;
  tags: string[];
  unsubscribeToken: string;
  subscribedAt: string;
  unsubscribedAt: string | null;
};

export type NewsletterStatus = "DRAFT" | "READY" | "PUBLISHED" | "ARCHIVED";

// REGULAR: subscriber-facing newsletter (existing flow). PROMOTIONAL: sent to
// admin-curated prospects to grow the subscriber base — see
// lib/newsletter/scheduler.ts::processCampaign and app/admin/(protected)/
// site/newsletter/promo/*. Promotional sends never record board-post
// newsletter usage and never get an issue number.
export type NewsletterType = "REGULAR" | "PROMOTIONAL";

export type Newsletter = {
  id: string;
  title: string;
  slug: string;
  subject: string;
  preheader: string | null;
  thumbnailUrl: string | null;
  status: NewsletterStatus;
  newsletterType: NewsletterType;
  blocks: ContentBlock[];
  viewCount: number;
  likeCount: number;
  dislikeCount: number;
  issueNumber: number | null;
  publishedAt: string | null;
  createdAt: string;
};

export type ProspectSource = "MANUAL" | "IMPORT";

// A promotional-newsletter recipient who isn't (yet) a real subscriber.
// Shares the { id, email, unsubscribeToken } shape with Subscriber so
// scheduler.ts can send to either audience through the same code path.
export type Prospect = {
  id: string;
  email: string;
  name: string | null;
  source: ProspectSource;
  unsubscribeToken: string;
  createdAt: string;
};

export type NewsletterTemplate = {
  id: string;
  name: string;
  blocks: ContentBlock[];
  createdAt: string;
};

export type AdBannerPosition = "TOP" | "MIDDLE" | "BOTTOM" | "SIDEBAR";

export type AdBanner = {
  id: string;
  name: string;
  imageUrl: string;
  linkUrl: string;
  position: AdBannerPosition;
  startDate: string;
  endDate: string;
  isActive: boolean;
};
