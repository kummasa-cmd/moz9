import Link from "next/link";
import { cn } from "@/lib/utils";
import type { AdBanner } from "../types";
import { sortBlocks, type ContentBlock } from "./types";

function assertNever(block: never): null {
  return block;
}

function HeadingBlockView({ block }: { block: Extract<ContentBlock, { type: "heading" }> }) {
  const sizeClass =
    block.content.level === 1 ? "text-3xl" : block.content.level === 2 ? "text-2xl" : "text-xl";
  const Tag = `h${block.content.level}` as "h1" | "h2" | "h3";
  return <Tag className={cn("font-bold text-foreground", sizeClass)}>{block.content.text}</Tag>;
}

function TextBlockView({ block }: { block: Extract<ContentBlock, { type: "text" }> }) {
  return (
    <div
      className="text-[15px] leading-relaxed text-foreground [&_a]:text-primary [&_a]:underline [&_p]:mb-4 [&_p:last-child]:mb-0 [&_strong]:font-semibold"
      dangerouslySetInnerHTML={{ __html: block.content.html }}
    />
  );
}

function ImageBlockView({ block }: { block: Extract<ContentBlock, { type: "image" }> }) {
  // eslint-disable-next-line @next/next/no-img-element
  const img = <img src={block.content.src} alt={block.content.alt} className="w-full rounded-lg" />;
  if (!block.content.link) return img;
  return (
    <Link href={block.content.link} target="_blank" rel="noopener noreferrer">
      {img}
    </Link>
  );
}

function ButtonBlockView({ block }: { block: Extract<ContentBlock, { type: "button" }> }) {
  const isPrimary = block.content.style === "primary";
  return (
    <Link
      href={block.content.url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex items-center rounded-md px-5 py-2.5 text-sm font-semibold",
        isPrimary
          ? "bg-primary text-primary-foreground hover:bg-primary/90"
          : "border border-primary text-primary hover:bg-primary/10",
      )}
    >
      {block.content.text}
    </Link>
  );
}

function DividerBlockView() {
  return <hr className="border-t border-border" />;
}

function AdBannerBlockView({ banner }: { banner: AdBanner | undefined }) {
  if (!banner) return null;
  return (
    <Link href={banner.linkUrl} target="_blank" rel="noopener noreferrer">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={banner.imageUrl} alt={banner.name} className="w-full rounded-lg" />
    </Link>
  );
}

export function NewsletterBlocks({
  blocks,
  banners = {},
}: {
  blocks: ContentBlock[];
  banners?: Record<string, AdBanner>;
}) {
  return (
    <div className="flex flex-col gap-4">
      {sortBlocks(blocks).map((block) => {
        switch (block.type) {
          case "heading":
            return <HeadingBlockView key={block.id} block={block} />;
          case "text":
            return <TextBlockView key={block.id} block={block} />;
          case "image":
            return <ImageBlockView key={block.id} block={block} />;
          case "button":
            return <ButtonBlockView key={block.id} block={block} />;
          case "divider":
            return <DividerBlockView key={block.id} />;
          case "ad_banner":
            return <AdBannerBlockView key={block.id} banner={banners[block.content.bannerId]} />;
          default:
            return assertNever(block);
        }
      })}
    </div>
  );
}
