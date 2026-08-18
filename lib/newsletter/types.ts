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

export type Newsletter = {
  id: string;
  title: string;
  slug: string;
  subject: string;
  preheader: string | null;
  thumbnailUrl: string | null;
  status: NewsletterStatus;
  blocks: ContentBlock[];
  viewCount: number;
  likeCount: number;
  dislikeCount: number;
  publishedAt: string | null;
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
