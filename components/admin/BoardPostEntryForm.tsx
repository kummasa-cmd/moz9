import { Save } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormSelect } from "@/components/admin/FormSelect";
import RichEditor from "@/components/admin/RichEditor";

type Category = { id: string; name: string };

type BoardPostEntryFormProps = {
  action: (formData: FormData) => Promise<void>;
  defaultValues?: {
    title?: string;
    content?: string;
    status?: string;
    category_id?: string | null;
    author?: string | null;
    published_at?: string | null;
    is_notice?: boolean;
  };
  categories?: Category[];
  error?: string;
  submitLabel?: string;
};

export default function BoardPostEntryForm({
  action,
  defaultValues = {},
  categories,
  error,
  submitLabel = "저장",
}: BoardPostEntryFormProps) {
  const publishedAt = defaultValues.published_at
    ? new Date(defaultValues.published_at).toISOString().slice(0, 16)
    : new Date().toISOString().slice(0, 16);

  return (
    <form action={action} className="rounded-xl border border-border bg-white p-6 space-y-6">
      {/* 공지글 + 상태 */}
      <div className="flex flex-wrap items-center gap-6">
        <label htmlFor="is_notice" className="flex items-center gap-2 cursor-pointer select-none">
          <input
            id="is_notice"
            name="is_notice"
            type="checkbox"
            defaultChecked={defaultValues.is_notice ?? false}
            className="h-4 w-4 accent-primary"
          />
          <span className="text-sm font-medium">공지글로 설정</span>
          <span className="text-xs text-muted-foreground">(목록 최상단 고정)</span>
        </label>

        <div className="flex items-center gap-2">
          <Label htmlFor="status">상태</Label>
          <FormSelect
            id="status"
            name="status"
            defaultValue={defaultValues.status ?? "게시중"}
            className="w-28"
          >
            <option value="게시중">게시중</option>
            <option value="숨김">숨김</option>
          </FormSelect>
        </div>
      </div>

      {/* 카테고리 */}
      {categories && categories.length > 0 && (
        <div className="space-y-2">
          <Label htmlFor="category_id">카테고리</Label>
          <FormSelect
            id="category_id"
            name="category_id"
            defaultValue={defaultValues.category_id ?? ""}
          >
            <option value="">카테고리 없음</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </FormSelect>
        </div>
      )}

      {/* 제목 */}
      <div className="space-y-2">
        <Label htmlFor="title">
          제목 <span className="text-destructive">*</span>
        </Label>
        <Input
          id="title"
          name="title"
          required
          defaultValue={defaultValues.title ?? ""}
          placeholder="게시물 제목을 입력하세요"
        />
      </div>

      {/* 작성자 + 등록일 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div className="space-y-2">
          <Label htmlFor="author">작성자</Label>
          <Input
            id="author"
            name="author"
            defaultValue={defaultValues.author ?? ""}
            placeholder="작성자 이름"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="published_at">등록일</Label>
          <Input
            id="published_at"
            name="published_at"
            type="datetime-local"
            defaultValue={publishedAt}
          />
        </div>
      </div>

      {/* 내용 (웹에디터) */}
      <div className="space-y-2">
        <Label>
          내용
          <span className="ml-2 text-xs text-muted-foreground font-normal">
            이미지는 붙여넣기 또는 툴바 아이콘으로 삽입 (최대 5MB)
          </span>
        </Label>
        <RichEditor name="content" defaultValue={defaultValues.content ?? ""} />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <button
        type="submit"
        className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
      >
        <Save size={15} />
        {submitLabel}
      </button>
    </form>
  );
}
