"use client";

import { useState } from "react";
import {
  Heading as HeadingIcon,
  Type,
  ImageIcon,
  MousePointerClick,
  Minus,
  Megaphone,
  ChevronUp,
  ChevronDown,
  Trash2,
} from "lucide-react";
import RichEditor from "@/components/RichEditor";
import { ImageUpload } from "./ImageUpload";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormSelect } from "@/components/admin/FormSelect";
import type { ContentBlock } from "@/lib/newsletter/blocks/types";

type BannerOption = { id: string; name: string };

type Props = {
  name: string;
  defaultValue: ContentBlock[];
  bannerOptions: BannerOption[];
};

const BLOCK_META: Record<ContentBlock["type"], { label: string; icon: typeof HeadingIcon }> = {
  heading: { label: "제목", icon: HeadingIcon },
  text: { label: "본문", icon: Type },
  image: { label: "이미지", icon: ImageIcon },
  button: { label: "버튼", icon: MousePointerClick },
  divider: { label: "구분선", icon: Minus },
  ad_banner: { label: "광고 배너", icon: Megaphone },
};

const BLOCK_ORDER: ContentBlock["type"][] = [
  "heading",
  "text",
  "image",
  "button",
  "divider",
  "ad_banner",
];

function createBlock(
  type: ContentBlock["type"],
  order: number,
  id: string,
  firstBannerId: string,
): ContentBlock {
  switch (type) {
    case "heading":
      return { id, order, type, content: { text: "", level: 2 } };
    case "text":
      return { id, order, type, content: { html: "" } };
    case "image":
      return { id, order, type, content: { src: "", alt: "" } };
    case "button":
      return { id, order, type, content: { text: "", url: "", style: "primary" } };
    case "divider":
      return { id, order, type };
    case "ad_banner":
      return { id, order, type, content: { bannerId: firstBannerId } };
  }
}

export function BlockEditor({ name, defaultValue, bannerOptions }: Props) {
  const [blocks, setBlocks] = useState<ContentBlock[]>(defaultValue);

  function addBlock(type: ContentBlock["type"]) {
    const id = crypto.randomUUID();
    setBlocks((prev) => [...prev, createBlock(type, prev.length, id, bannerOptions[0]?.id ?? "")]);
  }

  function replaceBlock(id: string, next: ContentBlock) {
    setBlocks((prev) => prev.map((b) => (b.id === id ? next : b)));
  }

  function removeBlock(id: string) {
    setBlocks((prev) => prev.filter((b) => b.id !== id).map((b, i) => ({ ...b, order: i })));
  }

  function moveBlock(id: string, direction: -1 | 1) {
    setBlocks((prev) => {
      const index = prev.findIndex((b) => b.id === id);
      const target = index + direction;
      if (index === -1 || target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next.map((b, i) => ({ ...b, order: i }));
    });
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-6">
      <input type="hidden" name={name} value={JSON.stringify(blocks)} />

      <div className="rounded-lg border border-border bg-white p-4 h-fit lg:sticky lg:top-6">
        <p className="text-sm font-semibold text-foreground mb-3">블록 추가</p>
        <div className="flex flex-col gap-1.5">
          {BLOCK_ORDER.map((type) => {
            const meta = BLOCK_META[type];
            const Icon = meta.icon;
            const disabled = type === "ad_banner" && bannerOptions.length === 0;
            return (
              <button
                key={type}
                type="button"
                onClick={() => addBlock(type)}
                disabled={disabled}
                className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-foreground hover:border-primary hover:text-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-border disabled:hover:text-foreground"
              >
                <Icon size={15} />
                {meta.label}
              </button>
            );
          })}
        </div>
        {bannerOptions.length === 0 && (
          <p className="text-xs text-muted-foreground mt-3">
            등록된 광고 배너가 없어 배너 블록을 추가할 수 없습니다.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-4">
        {blocks.length === 0 && (
          <p className="text-sm text-muted-foreground border border-dashed border-border rounded-lg p-10 text-center">
            왼쪽에서 블록을 추가해 주세요.
          </p>
        )}

        {blocks.map((block, index) => (
          <div key={block.id} className="rounded-lg border border-border bg-white p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                {BLOCK_META[block.type].label}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => moveBlock(block.id, -1)}
                  disabled={index === 0}
                  className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 transition-colors"
                  aria-label="위로 이동"
                >
                  <ChevronUp size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => moveBlock(block.id, 1)}
                  disabled={index === blocks.length - 1}
                  className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 transition-colors"
                  aria-label="아래로 이동"
                >
                  <ChevronDown size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => removeBlock(block.id)}
                  className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                  aria-label="삭제"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>

            <BlockFields
              block={block}
              bannerOptions={bannerOptions}
              onChange={(next) => replaceBlock(block.id, next)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function BlockFields({
  block,
  bannerOptions,
  onChange,
}: {
  block: ContentBlock;
  bannerOptions: BannerOption[];
  onChange: (next: ContentBlock) => void;
}) {
  switch (block.type) {
    case "heading":
      return (
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_100px] gap-3">
          <div className="space-y-1.5">
            <Label>텍스트</Label>
            <Input
              value={block.content.text}
              onChange={(e) =>
                onChange({ ...block, content: { ...block.content, text: e.target.value } })
              }
              placeholder="제목을 입력하세요"
            />
          </div>
          <div className="space-y-1.5">
            <Label>크기</Label>
            <FormSelect
              value={String(block.content.level)}
              onChange={(e) =>
                onChange({
                  ...block,
                  content: { ...block.content, level: Number(e.target.value) as 1 | 2 | 3 },
                })
              }
            >
              <option value="1">H1</option>
              <option value="2">H2</option>
              <option value="3">H3</option>
            </FormSelect>
          </div>
        </div>
      );

    case "text":
      return (
        <RichEditor
          name={`__block_text_${block.id}`}
          defaultValue={block.content.html}
          uploadEndpoint="/api/newsletter-image"
          onChange={(html) => onChange({ ...block, content: { ...block.content, html } })}
        />
      );

    case "image":
      return (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>이미지</Label>
            <ImageUpload
              name={`__block_image_${block.id}`}
              defaultValue={block.content.src}
              endpoint="/api/newsletter-image"
              onUploaded={(src) => onChange({ ...block, content: { ...block.content, src } })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>대체 텍스트 (alt)</Label>
            <Input
              value={block.content.alt}
              onChange={(e) =>
                onChange({ ...block, content: { ...block.content, alt: e.target.value } })
              }
              placeholder="이미지에 대한 설명"
            />
          </div>
          <div className="space-y-1.5">
            <Label>링크 (선택)</Label>
            <Input
              value={block.content.link ?? ""}
              onChange={(e) =>
                onChange({
                  ...block,
                  content: { ...block.content, link: e.target.value || undefined },
                })
              }
              placeholder="https://example.com"
            />
          </div>
        </div>
      );

    case "button":
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>버튼 텍스트</Label>
            <Input
              value={block.content.text}
              onChange={(e) =>
                onChange({ ...block, content: { ...block.content, text: e.target.value } })
              }
              placeholder="자세히 보기"
            />
          </div>
          <div className="space-y-1.5">
            <Label>스타일</Label>
            <FormSelect
              value={block.content.style}
              onChange={(e) =>
                onChange({
                  ...block,
                  content: { ...block.content, style: e.target.value as "primary" | "outline" },
                })
              }
            >
              <option value="primary">채워진 버튼</option>
              <option value="outline">테두리 버튼</option>
            </FormSelect>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>링크 URL</Label>
            <Input
              value={block.content.url}
              onChange={(e) =>
                onChange({ ...block, content: { ...block.content, url: e.target.value } })
              }
              placeholder="https://example.com"
            />
          </div>
        </div>
      );

    case "divider":
      return <p className="text-sm text-muted-foreground">가로 구분선이 표시됩니다.</p>;

    case "ad_banner":
      return (
        <div className="space-y-1.5">
          <Label>배너 선택</Label>
          <FormSelect
            value={block.content.bannerId}
            onChange={(e) =>
              onChange({ ...block, content: { ...block.content, bannerId: e.target.value } })
            }
          >
            {bannerOptions.map((banner) => (
              <option key={banner.id} value={banner.id}>
                {banner.name}
              </option>
            ))}
          </FormSelect>
        </div>
      );
  }
}
