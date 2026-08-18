"use client";

import { useMemo, useState, useTransition } from "react";
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
  Import,
  BookmarkPlus,
  UserRound,
} from "lucide-react";
import RichEditor from "@/components/RichEditor";
import { ImageUpload } from "./ImageUpload";
import { BoardPostPicker } from "./BoardPostPicker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormSelect } from "@/components/admin/FormSelect";
import { getSourcePostIds, type ContentBlock } from "@/lib/newsletter/blocks/types";
import type { BoardPostOption } from "@/lib/newsletter/queries";
import type { NewsletterTemplate } from "@/lib/newsletter/types";
import { saveNewsletterTemplate } from "@/app/admin/(protected)/site/newsletter/manage/template-actions";

type BannerOption = { id: string; name: string };

type Props = {
  name: string;
  defaultValue: ContentBlock[];
  bannerOptions: BannerOption[];
  boardPosts?: BoardPostOption[];
  templates?: NewsletterTemplate[];
  allowLoadTemplate?: boolean;
};

const BLOCK_META: Record<ContentBlock["type"], { label: string; icon: typeof HeadingIcon }> = {
  heading: { label: "제목", icon: HeadingIcon },
  text: { label: "본문", icon: Type },
  image: { label: "이미지", icon: ImageIcon },
  button: { label: "버튼", icon: MousePointerClick },
  divider: { label: "구분선", icon: Minus },
  ad_banner: { label: "광고 배너", icon: Megaphone },
  author_info: { label: "작성자 프로필", icon: UserRound },
};

// author_info is only auto-inserted by "게시판에서 가져오기" (importBoardPosts), not
// offered as a manually addable block — it's meaningless without a source post.
type AddableBlockType = Exclude<ContentBlock["type"], "author_info">;

const BLOCK_ORDER: AddableBlockType[] = ["heading", "text", "image", "button", "divider", "ad_banner"];

// Blocks imported together from one board post (importBoardPosts) share a
// sourcePostId and stay contiguous in `blocks`, so they render/move/delete as
// one "섹션" unit instead of separate blocks.
type EditorGroup =
  | { kind: "section"; sourcePostId: string; blocks: ContentBlock[] }
  | { kind: "single"; block: ContentBlock };

function groupBlocks(blocks: ContentBlock[]): EditorGroup[] {
  const groups: EditorGroup[] = [];
  for (const block of blocks) {
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

function createBlock(
  type: AddableBlockType,
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

export function BlockEditor({
  name,
  defaultValue,
  bannerOptions,
  boardPosts = [],
  templates = [],
  allowLoadTemplate = false,
}: Props) {
  const [blocks, setBlocks] = useState<ContentBlock[]>(defaultValue);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [templateNameOpen, setTemplateNameOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [templateMessage, setTemplateMessage] = useState<string | null>(null);
  const [isSavingTemplate, startSavingTemplate] = useTransition();

  function addBlock(type: AddableBlockType) {
    const id = crypto.randomUUID();
    setBlocks((prev) => [...prev, createBlock(type, prev.length, id, bannerOptions[0]?.id ?? "")]);
  }

  const groups = useMemo(() => groupBlocks(blocks), [blocks]);
  const sectionCount = useMemo(() => groups.filter((g) => g.kind === "section").length, [groups]);
  const importedPostIds = useMemo(() => new Set(getSourcePostIds(blocks)), [blocks]);

  function replaceBlock(id: string, next: ContentBlock) {
    setBlocks((prev) => prev.map((b) => (b.id === id ? next : b)));
  }

  function removeBlock(id: string) {
    setBlocks((prev) => prev.filter((b) => b.id !== id).map((b, i) => ({ ...b, order: i })));
  }

  function moveGroup(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= groups.length) return;
    const next = [...groups];
    [next[index], next[target]] = [next[target], next[index]];
    const flattened = next.flatMap((g) => (g.kind === "section" ? g.blocks : [g.block]));
    setBlocks(flattened.map((b, i) => ({ ...b, order: i })));
  }

  function removeGroup(group: EditorGroup) {
    if (group.kind === "single") {
      removeBlock(group.block.id);
      return;
    }
    if (sectionCount <= 1) return;
    setBlocks((prev) =>
      prev.filter((b) => b.sourcePostId !== group.sourcePostId).map((b, i) => ({ ...b, order: i })),
    );
  }

  function importBoardPosts(posts: BoardPostOption[]) {
    setBlocks((prev) => {
      let cursor = prev.length;
      const appended: ContentBlock[] = [];

      for (const post of posts) {
        if (post.author) {
          appended.push({
            id: crypto.randomUUID(),
            order: cursor++,
            type: "author_info",
            content: { name: post.author.name, avatarUrl: post.author.avatarUrl },
            sourcePostId: post.id,
          });
        }

        appended.push(
          {
            id: crypto.randomUUID(),
            order: cursor++,
            type: "heading",
            content: { text: post.title, level: 2 },
            sourcePostId: post.id,
          },
          {
            id: crypto.randomUUID(),
            order: cursor++,
            type: "text",
            content: { html: post.content },
            sourcePostId: post.id,
          },
        );
      }

      return [...prev, ...appended];
    });
    setPickerOpen(false);
  }

  function loadTemplate(templateId: string) {
    const template = templates.find((t) => t.id === templateId);
    if (!template) return;
    if (blocks.length > 0 && !window.confirm("현재 작성 중인 블록이 템플릿 내용으로 대체됩니다. 계속할까요?")) {
      return;
    }
    setBlocks(
      template.blocks.map((block, i) => ({ ...block, id: crypto.randomUUID(), order: i })),
    );
  }

  function submitTemplateName() {
    startSavingTemplate(async () => {
      const result = await saveNewsletterTemplate(templateName, blocks);
      if (result.ok) {
        setTemplateMessage("템플릿으로 저장했습니다.");
        setTemplateNameOpen(false);
        setTemplateName("");
      } else {
        setTemplateMessage(result.error);
      }
    });
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-6">
      <input type="hidden" name={name} value={JSON.stringify(blocks)} />

      <div className="rounded-lg border border-border bg-white p-4 h-fit lg:sticky lg:top-6 space-y-4">
        <div>
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

        <div className="border-t border-border pt-4">
          <p className="text-sm font-semibold text-foreground mb-3">게시판 연동</p>
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            disabled={boardPosts.length === 0}
            className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-foreground hover:border-primary hover:text-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed w-full"
          >
            <Import size={15} />
            게시판에서 가져오기
          </button>
          {boardPosts.length === 0 && (
            <p className="text-xs text-muted-foreground mt-2">
              컬럼/연재/정보/광고 게시판에 게시물이 없습니다.
            </p>
          )}
        </div>

        <div className="border-t border-border pt-4 space-y-2">
          <p className="text-sm font-semibold text-foreground mb-1">템플릿</p>

          {allowLoadTemplate && (
            <FormSelect
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) loadTemplate(e.target.value);
                e.target.value = "";
              }}
            >
              <option value="">템플릿 불러오기...</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </FormSelect>
          )}

          {templateNameOpen ? (
            <div className="space-y-2">
              <Input
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="템플릿 이름"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={submitTemplateName}
                  disabled={isSavingTemplate}
                  className="flex-1 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  저장
                </button>
                <button
                  type="button"
                  onClick={() => setTemplateNameOpen(false)}
                  className="rounded-md border border-border px-3 py-1.5 text-sm text-foreground hover:bg-muted transition-colors"
                >
                  취소
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setTemplateNameOpen(true);
                setTemplateMessage(null);
              }}
              disabled={blocks.length === 0}
              className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-foreground hover:border-primary hover:text-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed w-full"
            >
              <BookmarkPlus size={15} />
              템플릿으로 저장
            </button>
          )}

          {templateMessage && <p className="text-xs text-muted-foreground">{templateMessage}</p>}
        </div>
      </div>

      {pickerOpen && (
        <BoardPostPicker
          posts={boardPosts}
          importedPostIds={importedPostIds}
          onImport={importBoardPosts}
          onClose={() => setPickerOpen(false)}
        />
      )}

      <div className="flex flex-col gap-4">
        {blocks.length === 0 && (
          <p className="text-sm text-muted-foreground border border-dashed border-border rounded-lg p-10 text-center">
            왼쪽에서 블록을 추가해 주세요.
          </p>
        )}

        {groups.map((group, index) => {
          const moveControls = (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => moveGroup(index, -1)}
                disabled={index === 0}
                className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 transition-colors"
                aria-label="위로 이동"
              >
                <ChevronUp size={15} />
              </button>
              <button
                type="button"
                onClick={() => moveGroup(index, 1)}
                disabled={index === groups.length - 1}
                className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 transition-colors"
                aria-label="아래로 이동"
              >
                <ChevronDown size={15} />
              </button>
            </div>
          );

          if (group.kind === "single") {
            const block = group.block;
            return (
              <div key={block.id} className="rounded-lg border border-border bg-white p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    {BLOCK_META[block.type].label}
                  </span>
                  <div className="flex items-center gap-1">
                    {moveControls}
                    <button
                      type="button"
                      onClick={() => removeGroup(group)}
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
            );
          }

          const canDeleteSection = sectionCount > 1;

          return (
            <div
              key={group.sourcePostId}
              className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-4"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-primary uppercase tracking-wide">
                  게시판 가져오기 섹션
                </span>
                <div className="flex items-center gap-1">
                  {moveControls}
                  <button
                    type="button"
                    onClick={() => removeGroup(group)}
                    disabled={!canDeleteSection}
                    title={!canDeleteSection ? "섹션이 하나뿐이면 삭제할 수 없습니다." : undefined}
                    className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted-foreground transition-colors"
                    aria-label="섹션 삭제"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>

              {group.blocks.map((block) => (
                <div key={block.id} className="border-t border-primary/10 pt-4 first:border-t-0 first:pt-0">
                  <span className="text-xs font-medium text-muted-foreground mb-2 block">
                    {BLOCK_META[block.type].label}
                  </span>
                  <BlockFields
                    block={block}
                    bannerOptions={bannerOptions}
                    onChange={(next) => replaceBlock(block.id, next)}
                  />
                </div>
              ))}
            </div>
          );
        })}
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

    case "author_info":
      return (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>닉네임</Label>
            <Input
              value={block.content.name}
              onChange={(e) =>
                onChange({ ...block, content: { ...block.content, name: e.target.value } })
              }
              placeholder="작성자 닉네임"
            />
          </div>
          <div className="space-y-1.5">
            <Label>프로필 이미지 (비워두면 실루엣 아이콘 표시)</Label>
            <ImageUpload
              name={`__block_avatar_${block.id}`}
              defaultValue={block.content.avatarUrl}
              endpoint="/api/newsletter-image"
              onUploaded={(avatarUrl) =>
                onChange({ ...block, content: { ...block.content, avatarUrl: avatarUrl || null } })
              }
            />
          </div>
        </div>
      );
  }
}
