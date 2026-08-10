import type { ContentBlock } from "@/lib/newsletter/blocks/types";

export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

export type NewsletterDetail = {
  id: string;
  title: string;
  slug: string;
  subject: string;
  preheader: string | null;
  thumbnailUrl: string | null;
  status: string;
  blocks: ContentBlock[];
};

export type CampaignSummary = {
  id: string;
  name: string;
  sendType: string;
  status: string;
  scheduledAt: string | null;
  recurringTime: string | null;
  rangeStart: string | null;
  rangeEnd: string | null;
  targetAll: boolean;
  targetTags: string[];
  totalRecipients: number;
  totalSent: number;
};

export type NewsletterSendRow = {
  id: string;
  title: string;
  slug: string;
  status: string;
  viewCount: number;
  publishedAt: string | null;
  createdAt: string;
  campaign: CampaignSummary | null;
};

export type SubscriberRow = {
  id: string;
  email: string;
  name: string | null;
  source: string;
  status: string;
  tags: string[];
  subscribedAt: string;
};

export type BannerRow = {
  id: string;
  name: string;
  imageUrl: string;
  linkUrl: string;
  position: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  impressions: number;
  clicks: number;
};
