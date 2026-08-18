import { newsletterConfig } from "../config";
import type { AdBanner } from "../types";
import { sortBlocks, type ContentBlock } from "./types";

const FONT_STACK = "'Pretendard', 'Inter', -apple-system, sans-serif";
const TEXT_COLOR = "#1A1A2E";
const MUTED_BORDER = "#E5E7EB";

function assertNever(block: never): string {
  return block;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderHeading(block: Extract<ContentBlock, { type: "heading" }>): string {
  const fontSize = block.content.level === 1 ? "28px" : block.content.level === 2 ? "22px" : "18px";
  return `<h${block.content.level} style="margin:0 0 16px;font-family:${FONT_STACK};font-size:${fontSize};font-weight:700;color:${TEXT_COLOR};">${escapeHtml(block.content.text)}</h${block.content.level}>`;
}

function renderText(block: Extract<ContentBlock, { type: "text" }>): string {
  return `<div style="margin:0 0 16px;font-family:${FONT_STACK};font-size:15px;line-height:1.7;color:${TEXT_COLOR};">${block.content.html}</div>`;
}

function renderImage(block: Extract<ContentBlock, { type: "image" }>): string {
  const img = `<img src="${escapeHtml(block.content.src)}" alt="${escapeHtml(block.content.alt)}" style="max-width:100%;display:block;margin:0 0 16px;border-radius:8px;" />`;
  if (!block.content.link) return img;
  return `<a href="${escapeHtml(block.content.link)}" target="_blank" rel="noopener noreferrer">${img}</a>`;
}

function renderButton(block: Extract<ContentBlock, { type: "button" }>, brandColor: string): string {
  const isPrimary = block.content.style === "primary";
  const style = isPrimary
    ? `background:${brandColor};color:#ffffff;border:1px solid ${brandColor};`
    : `background:transparent;color:${brandColor};border:1px solid ${brandColor};`;
  return `<div style="margin:0 0 16px;"><a href="${escapeHtml(block.content.url)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:10px 20px;border-radius:6px;font-family:${FONT_STACK};font-size:14px;font-weight:600;text-decoration:none;${style}">${escapeHtml(block.content.text)}</a></div>`;
}

function renderDivider(): string {
  return `<hr style="border:none;border-top:1px solid ${MUTED_BORDER};margin:24px 0;" />`;
}

function renderAuthorInfo(block: Extract<ContentBlock, { type: "author_info" }>): string {
  const avatarSrc = block.content.avatarUrl || `${newsletterConfig.siteUrl}/images/avatar-placeholder.svg`;
  return `<div style="margin:0 0 16px;">
    <img src="${escapeHtml(avatarSrc)}" alt="${escapeHtml(block.content.name)}" width="40" height="40" style="width:40px;height:40px;border-radius:50%;object-fit:cover;vertical-align:middle;margin-right:10px;" />
    <span style="font-family:${FONT_STACK};font-size:14px;font-weight:600;color:${TEXT_COLOR};vertical-align:middle;">${escapeHtml(block.content.name)}</span>
  </div>`;
}

function renderAdBanner(banner: AdBanner | undefined): string {
  if (!banner) return "";
  return `<a href="${escapeHtml(banner.linkUrl)}" target="_blank" rel="noopener noreferrer"><img src="${escapeHtml(banner.imageUrl)}" alt="${escapeHtml(banner.name)}" style="max-width:100%;display:block;margin:0 0 16px;border-radius:8px;" /></a>`;
}

export function renderBlocksToHtml(
  blocks: ContentBlock[],
  options: { brandColor: string; banners: Record<string, AdBanner> },
): string {
  return sortBlocks(blocks)
    .map((block) => {
      switch (block.type) {
        case "heading":
          return renderHeading(block);
        case "text":
          return renderText(block);
        case "image":
          return renderImage(block);
        case "button":
          return renderButton(block, options.brandColor);
        case "divider":
          return renderDivider();
        case "ad_banner":
          return renderAdBanner(options.banners[block.content.bannerId]);
        case "author_info":
          return renderAuthorInfo(block);
        default:
          return assertNever(block);
      }
    })
    .join("\n");
}
