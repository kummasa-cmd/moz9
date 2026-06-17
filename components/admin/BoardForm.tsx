import { Save } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormSelect } from "@/components/admin/FormSelect";

type BoardDefaultValues = {
  name?: string;
  slug?: string;
  type?: string;
  sort_order?: number;
  is_visible?: boolean;
  allow_user_write?: boolean;
  use_category?: boolean;
  use_comment?: boolean;
};

type BoardFormProps = {
  action: (formData: FormData) => Promise<void>;
  defaultValues?: BoardDefaultValues;
  error?: string;
  submitLabel?: string;
};

function CheckField({
  id,
  name,
  label,
  description,
  defaultChecked,
}: {
  id: string;
  name: string;
  label: string;
  description: string;
  defaultChecked?: boolean;
}) {
  return (
    <label htmlFor={id} className="flex items-start gap-3 cursor-pointer select-none">
      <input
        id={id}
        name={name}
        type="checkbox"
        defaultChecked={defaultChecked}
        className="mt-0.5 h-4 w-4 accent-primary"
      />
      <div>
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </label>
  );
}

export default function BoardForm({
  action,
  defaultValues = {},
  error,
  submitLabel = "저장",
}: BoardFormProps) {
  return (
    <form action={action} className="rounded-xl border border-border bg-white p-6 space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div className="space-y-2">
          <Label htmlFor="name">
            게시판명 <span className="text-destructive">*</span>
          </Label>
          <Input
            id="name"
            name="name"
            required
            defaultValue={defaultValues.name ?? ""}
            placeholder="자유게시판"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="slug">
            슬러그 <span className="text-destructive">*</span>
          </Label>
          <Input
            id="slug"
            name="slug"
            required
            defaultValue={defaultValues.slug ?? ""}
            placeholder="free-board"
            pattern="[a-z0-9\-]+"
            title="영소문자·숫자·하이픈만 사용 가능"
          />
          <p className="text-xs text-muted-foreground">영소문자·숫자·하이픈만 사용 가능 (예: free-board)</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div className="space-y-2">
          <Label htmlFor="type">게시판 유형</Label>
          <FormSelect id="type" name="type" defaultValue={defaultValues.type ?? "일반"}>
            <option value="일반">일반 — 전체 게시물 공개</option>
            <option value="개인">개인 — 본인 게시물만 표시</option>
          </FormSelect>
          <p className="text-xs text-muted-foreground">관리자는 모든 게시물을 볼 수 있습니다.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="sort_order">정렬 순서</Label>
          <Input
            id="sort_order"
            name="sort_order"
            type="number"
            min={0}
            defaultValue={defaultValues.sort_order ?? 0}
          />
        </div>
      </div>

      <div className="space-y-4 pt-4 border-t border-border">
        <p className="text-sm font-semibold text-foreground">옵션 설정</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <CheckField
            id="is_visible"
            name="is_visible"
            label="노출"
            description="게시판을 사이트에 공개합니다."
            defaultChecked={defaultValues.is_visible ?? true}
          />
          <CheckField
            id="allow_user_write"
            name="allow_user_write"
            label="사용자 입력"
            description="로그인 회원이 글을 작성할 수 있습니다."
            defaultChecked={defaultValues.allow_user_write ?? false}
          />
          <CheckField
            id="use_category"
            name="use_category"
            label="카테고리 사용"
            description="게시물에 카테고리를 적용합니다."
            defaultChecked={defaultValues.use_category ?? false}
          />
          <CheckField
            id="use_comment"
            name="use_comment"
            label="댓글 사용"
            description="댓글 및 답글 기능을 활성화합니다."
            defaultChecked={defaultValues.use_comment ?? false}
          />
        </div>
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
