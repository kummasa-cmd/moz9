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

export function getAdBannerIds(blocks: ContentBlock[]): string[] {
  return blocks
    .filter((block): block is AdBannerBlock => block.type === "ad_banner")
    .map((block) => block.content.bannerId);
}

export function getSourcePostIds(blocks: ContentBlock[]): string[] {
  return [...new Set(blocks.map((block) => block.sourcePostId).filter((id): id is string => !!id))];
}
