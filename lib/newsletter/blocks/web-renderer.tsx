import Link from "next/link";
import { cn } from "@/lib/utils";
import { PostFeedbackButtons } from "@/components/newsletter/PostFeedbackButtons";
import type { AdBanner } from "../types";
import { getNewsletterPostFeedbackUrl } from "../config";
import type { PostFeedbackCounts } from "../queries";
import { groupBlocksBySourcePost, getSectionAuthorName, type ContentBlock } from "./types";

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

function AuthorInfoBlockView({ block }: { block: Extract<ContentBlock, { type: "author_info" }> }) {
  return (
    <div className="flex items-center gap-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={block.content.avatarUrl || "/images/avatar-placeholder.svg"}
        alt={block.content.name}
        className="w-10 h-10 rounded-full object-cover flex-shrink-0"
      />
      <span className="text-sm font-semibold text-foreground">{block.content.name}</span>
    </div>
  );
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

function BlockView({ block, banners }: { block: ContentBlock; banners: Record<string, AdBanner> }) {
  switch (block.type) {
    case "heading":
      return <HeadingBlockView block={block} />;
    case "text":
      return <TextBlockView block={block} />;
    case "image":
      return <ImageBlockView block={block} />;
    case "button":
      return <ButtonBlockView block={block} />;
    case "divider":
      return <DividerBlockView />;
    case "ad_banner":
      return <AdBannerBlockView banner={banners[block.content.bannerId]} />;
    case "author_info":
      return <AuthorInfoBlockView block={block} />;
    default:
      return assertNever(block);
  }
}

function CopyrightNotice({ authorName }: { authorName: string | null }) {
  return (
    <p className="text-xs text-muted-foreground/70">
      이 글의 저작권은 {authorName ? `${authorName}님` : "작성자"}에게 있으며, 사전 동의 없이 무단으로
      복제·전재·재배포하거나 변형할 수 없습니다.
    </p>
  );
}

// Per-post (게시물별) 좋았어요/아쉬워요 — one widget per imported board-post
// section (column/series/info/ad boards, ad posts included), separate from
// the whole-newsletter feedback in NewsletterFooterActions.
function PostFeedbackView({
  newsletterId,
  slug,
  sourcePostId,
  counts,
  votedType,
  justVoted,
}: {
  newsletterId: string;
  slug: string;
  sourcePostId: string;
  counts?: { likeCount: number; dislikeCount: number };
  votedType: "like" | "dislike" | null;
  justVoted: "like" | "dislike" | null;
}) {
  const likeUrl = getNewsletterPostFeedbackUrl(newsletterId, slug, sourcePostId, "like");
  const dislikeUrl = getNewsletterPostFeedbackUrl(newsletterId, slug, sourcePostId, "dislike");

  return (
    <div id={`post-${sourcePostId}`} className="flex flex-wrap items-center gap-2 pt-1">
      <span className="text-xs text-muted-foreground">이 글 어떠셨나요?</span>
      <PostFeedbackButtons
        likeUrl={likeUrl}
        dislikeUrl={dislikeUrl}
        likeCount={counts?.likeCount ?? 0}
        dislikeCount={counts?.dislikeCount ?? 0}
        votedType={votedType}
        justVoted={justVoted}
      />
    </div>
  );
}

export function NewsletterBlocks({
  blocks,
  banners = {},
  newsletterId,
  slug,
  postFeedbackCounts = {},
  postVotes = {},
  justVotedPostId,
  justVotedType = null,
}: {
  blocks: ContentBlock[];
  banners?: Record<string, AdBanner>;
  newsletterId: string;
  slug: string;
  postFeedbackCounts?: PostFeedbackCounts;
  postVotes?: Record<string, "like" | "dislike">;
  justVotedPostId?: string;
  justVotedType?: "like" | "dislike" | null;
}) {
  const groups = groupBlocksBySourcePost(blocks);

  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) => {
        if (group.kind === "single") {
          return <BlockView key={group.block.id} block={group.block} banners={banners} />;
        }

        return (
          <div key={group.sourcePostId} className="flex flex-col gap-4">
            {group.blocks.map((block) => (
              <BlockView key={block.id} block={block} banners={banners} />
            ))}
            <CopyrightNotice authorName={getSectionAuthorName(group.blocks)} />
            <PostFeedbackView
              newsletterId={newsletterId}
              slug={slug}
              sourcePostId={group.sourcePostId}
              counts={postFeedbackCounts[group.sourcePostId]}
              votedType={postVotes[group.sourcePostId] ?? null}
              justVoted={justVotedPostId === group.sourcePostId ? justVotedType : null}
            />
          </div>
        );
      })}
    </div>
  );
}
