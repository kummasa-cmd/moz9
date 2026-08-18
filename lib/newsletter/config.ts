export const newsletterConfig = {
  senderName: process.env.NEWSLETTER_SENDER_NAME ?? "Newsletter",
  senderEmail: process.env.NEWSLETTER_SENDER_EMAIL ?? "",
  brandColor: process.env.NEWSLETTER_BRAND_COLOR ?? "#3B5BFF",
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  cronSecret: process.env.CRON_SECRET ?? "",
};

export function getUnsubscribeUrl(token: string): string {
  return `${newsletterConfig.siteUrl}/newsletter/unsubscribe?token=${token}`;
}

export function getNewsletterUrl(slug: string): string {
  return `${newsletterConfig.siteUrl}/newsletter/${slug}`;
}

export function getNewsletterFeedbackUrl(
  newsletterId: string,
  slug: string,
  type: "like" | "dislike",
): string {
  return `${newsletterConfig.siteUrl}/api/newsletter/feedback/${newsletterId}?type=${type}&slug=${encodeURIComponent(slug)}`;
}

export function getContactUrl(): string {
  return `${newsletterConfig.siteUrl}/contact`;
}

export function getNewsletterArchiveUrl(): string {
  return `${newsletterConfig.siteUrl}/newsletter`;
}

export function getNewsletterSubscribeUrl(): string {
  return `${newsletterConfig.siteUrl}/newsletter/subscribe`;
}
