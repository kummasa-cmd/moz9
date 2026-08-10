type BlockBase = {
  id: string;
  order: number;
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

export type ContentBlock =
  | HeadingBlock
  | TextBlock
  | ImageBlock
  | ButtonBlock
  | DividerBlock
  | AdBannerBlock;

export function sortBlocks(blocks: ContentBlock[]): ContentBlock[] {
  return [...blocks].sort((a, b) => a.order - b.order);
}

export function getAdBannerIds(blocks: ContentBlock[]): string[] {
  return blocks
    .filter((block): block is AdBannerBlock => block.type === "ad_banner")
    .map((block) => block.content.bannerId);
}
