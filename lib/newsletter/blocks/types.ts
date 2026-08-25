type BlockBase = {
  id: string;
  order: number;
  // Set when this block was generated from a column/series/info/ad board post
  // (BoardPostPicker), so send/publish-time usage tracking can find it back.
  sourcePostId?: string;
};

export type HeadingBlock = BlockBase & {
  type: "heading";
  content: { text: string; level: 1 | 2 | 3 };
};

export type TextBlock = BlockBase & {
  type: "text";
  content: { html: string };
};

export type ImageBlock = BlockBase & {
  type: "image";
  content: { src: string; alt: string; link?: string };
};

export type ButtonBlock = BlockBase & {
  type: "button";
  content: { text: string; url: string; style: "primary" | "outline" };
};

export type DividerBlock = BlockBase & {
  type: "divider";
};

export type AdBannerBlock = BlockBase & {
  type: "ad_banner";
  content: { bannerId: string };
};

// Auto-inserted when importing a board post written by a member (not an admin) —
// shows the author's profile before their content starts.
export type AuthorInfoBlock = BlockBase & {
  type: "author_info";
  content: { name: string; avatarUrl: string | null };
};

export type ContentBlock =
  | HeadingBlock
  | TextBlock
  | ImageBlock
  | ButtonBlock
  | DividerBlock
  | AdBannerBlock
  | AuthorInfoBlock;

export function sortBlocks(blocks: ContentBlock[]): ContentBlock[] {
  return [...blocks].sort((a, b) => a.order - b.order);
}

// Groups blocks that came from the same imported board post (same
// sourcePostId, contiguous in order) into one "section" — mirrors
// components/admin/newsletter/BlockEditor.tsx's groupBlocks, which is what
// the admin sees as one "게시판 가져오기 섹션" while editing. Renderers use
// this to attach one per-post feedback (좋았어요/아쉬워요) widget per
// imported post/ad, instead of per raw block.
export type BlockGroup =
  | { kind: "section"; sourcePostId: string; blocks: ContentBlock[] }
  | { kind: "single"; block: ContentBlock };

export function groupBlocksBySourcePost(blocks: ContentBlock[]): BlockGroup[] {
  const groups: BlockGroup[] = [];
  for (const block of sortBlocks(blocks)) {
    const last = groups[groups.length - 1];
    if (block.sourcePostId && last?.kind === "section" && last.sourcePostId === block.sourcePostId) {
      last.blocks.push(block);
    } else if (block.sourcePostId) {
      groups.push({ kind: "section", sourcePostId: block.sourcePostId, blocks: [block] });
    } else {
      groups.push({ kind: "single", block });
    }
  }
  return groups;
}

export function getAdBannerIds(blocks: ContentBlock[]): string[] {
  return blocks
    .filter((block): block is AdBannerBlock => block.type === "ad_banner")
    .map((block) => block.content.bannerId);
}

export function getSourcePostIds(blocks: ContentBlock[]): string[] {
  return [...new Set(blocks.map((block) => block.sourcePostId).filter((id): id is string => !!id))];
}

// Reads the author name off a section's auto-inserted author_info block (if
// any), so the copyright notice next to each imported post can name the
// actual author instead of a generic "작성자".
export function getSectionAuthorName(blocks: ContentBlock[]): string | null {
  const authorBlock = blocks.find((block): block is AuthorInfoBlock => block.type === "author_info");
  return authorBlock?.content.name ?? null;
}
