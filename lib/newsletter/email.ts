import { Resend } from "resend";
import {
  newsletterConfig,
  getUnsubscribeUrl,
  getNewsletterFeedbackUrl,
  getContactUrl,
  getNewsletterArchiveUrl,
  getNewsletterSubscribeUrl,
} from "./config";

export function getResendClient(): Resend {
  if (!newsletterConfig.resendApiKey) {
    throw new Error("RESEND_API_KEY가 설정되지 않았습니다.");
  }
  return new Resend(newsletterConfig.resendApiKey);
}

const OPEN_PIXEL_PLACEHOLDER = "__NEWSLETTER_OPEN_PIXEL__";
const UNSUBSCRIBE_URL_PLACEHOLDER = "__NEWSLETTER_UNSUBSCRIBE_URL__";

// Mirrors the top meta bar on the web reading page (app/(site)/newsletter/[slug]/page.tsx):
// date | issue number | subscribe | archive.
function renderEmailHeaderMeta(meta: { publishedAt: string | null; issueNumber: number | null }): string {
  const linkStyle = "color:#6B7280;text-decoration:underline;";
  const sepStyle = "color:#E5E7EB;margin:0 8px;";
  const parts: string[] = [];

  if (meta.publishedAt) {
    parts.push(
      `<span style="color:#6B7280;">${new Date(meta.publishedAt).toLocaleDateString("ko-KR")}</span>`,
    );
  }
  if (meta.issueNumber !== null) {
    parts.push(`<span style="color:#6B7280;">제${meta.issueNumber}호</span>`);
  }
  parts.push(`<a href="${getNewsletterSubscribeUrl()}" style="${linkStyle}">구독하기</a>`);
  parts.push(`<a href="${getNewsletterArchiveUrl()}" style="${linkStyle}">지난호</a>`);

  return `
      <div style="margin:0 0 20px;padding-bottom:16px;border-bottom:1px solid #E5E7EB;font-family:'Pretendard','Inter',-apple-system,sans-serif;font-size:12px;">
        ${parts.join(`<span style="${sepStyle}">|</span>`)}
      </div>`;
}

function renderEmailFooterActions(newsletterId: string, slug: string): string {
  const likeUrl = getNewsletterFeedbackUrl(newsletterId, slug, "like");
  const dislikeUrl = getNewsletterFeedbackUrl(newsletterId, slug, "dislike");
  const linkStyle =
    "display:inline-block;padding:9px 16px;border-radius:6px;font-family:'Pretendard','Inter',-apple-system,sans-serif;font-size:13px;font-weight:600;text-decoration:none;";

  return `
      <div style="margin:32px 0 0;text-align:center;">
        <p style="margin:0 0 10px;font-family:'Pretendard','Inter',-apple-system,sans-serif;font-size:13px;color:#6B7280;">이번 뉴스레터 어떠셨나요?</p>
        <a href="${likeUrl}" style="${linkStyle}background:#3B5BFF;color:#ffffff;margin:0 4px;">👍 좋았어요</a>
        <a href="${dislikeUrl}" style="${linkStyle}background:transparent;color:#3B5BFF;border:1px solid #3B5BFF;margin:0 4px;">👎 아쉬워요</a>
      </div>
      <div style="margin:20px 0 0;text-align:center;">
        <a href="${getContactUrl()}" style="${linkStyle}background:transparent;color:#6B7280;border:1px solid #E5E7EB;margin:0 4px;">제휴·협업 문의</a>
      </div>
      <div style="margin:12px 0 0;text-align:center;">
        <a href="${getNewsletterArchiveUrl()}" style="font-family:'Pretendard','Inter',-apple-system,sans-serif;font-size:12px;color:#6B7280;text-decoration:underline;margin:0 8px;">이전뉴스 보기</a>
        <a href="${getNewsletterSubscribeUrl()}" style="font-family:'Pretendard','Inter',-apple-system,sans-serif;font-size:12px;color:#6B7280;text-decoration:underline;margin:0 8px;">구독하기</a>
      </div>`;
}

export function buildEmailTemplate(
  bodyHtml: string,
  meta: { newsletterId: string; slug: string; publishedAt: string | null; issueNumber: number | null },
): string {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body style="margin:0;padding:24px;background:#f4f4f5;">
    <div style="max-width:600px;margin:0 auto;background:#ffffff;padding:32px;border-radius:12px;">
      ${renderEmailHeaderMeta({ publishedAt: meta.publishedAt, issueNumber: meta.issueNumber })}
      ${bodyHtml}
      ${renderEmailFooterActions(meta.newsletterId, meta.slug)}
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:32px 0 16px;" />
      <p style="margin:0;font-family:'Pretendard','Inter',-apple-system,sans-serif;font-size:12px;color:#6B7280;text-align:center;">
        더 이상 이 메일을 받고 싶지 않으시다면
        <a href="${UNSUBSCRIBE_URL_PLACEHOLDER}" style="color:#6B7280;text-decoration:underline;">수신거부</a>
        해 주세요.
      </p>
    </div>
    <img src="${OPEN_PIXEL_PLACEHOLDER}" width="1" height="1" alt="" style="display:none;" />
  </body>
</html>`;
}

// Admin preview only: renders the real email template (footer buttons, unsubscribe line)
// with harmless stand-in links since there's no real delivery/tracking token yet.
export function buildPreviewEmailHtml(
  bodyHtml: string,
  meta: { newsletterId: string; slug: string; publishedAt: string | null; issueNumber: number | null },
): string {
  return buildEmailTemplate(bodyHtml, meta)
    .replaceAll(UNSUBSCRIBE_URL_PLACEHOLDER, "#")
    .replaceAll(OPEN_PIXEL_PLACEHOLDER, "");
}

function wrapClickLinks(html: string, trackingToken: string): string {
  return html.replace(/href="([^"]+)"/g, (match, url: string) => {
    if (url.startsWith("mailto:") || url.startsWith("tel:") || url.startsWith("#")) return match;
    if (url === UNSUBSCRIBE_URL_PLACEHOLDER) return match;

    const trackedUrl = `${newsletterConfig.siteUrl}/api/track/click/${trackingToken}?url=${encodeURIComponent(url)}`;
    return `href="${trackedUrl}"`;
  });
}

export function personalizeEmail(
  templateHtml: string,
  opts: { trackingToken: string; unsubscribeToken: string },
): string {
  let html = wrapClickLinks(templateHtml, opts.trackingToken);
  html = html.replaceAll(UNSUBSCRIBE_URL_PLACEHOLDER, getUnsubscribeUrl(opts.unsubscribeToken));
  html = html.replaceAll(
    OPEN_PIXEL_PLACEHOLDER,
    `${newsletterConfig.siteUrl}/api/track/open/${opts.trackingToken}`,
  );
  return html;
}

export function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
}
