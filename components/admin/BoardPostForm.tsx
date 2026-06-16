import { Save } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { FormSelect } from "@/components/admin/FormSelect";

type BoardPostFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  defaultValues?: {
    board?: string;
    title?: string;
    content?: string;
    status?: string;
  };
  error?: string;
  submitLabel: string;
};

export default function BoardPostForm({
  action,
  defaultValues,
  error,
  submitLabel,
}: BoardPostFormProps) {
  return (
    <form action={action} className="rounded-xl border border-border bg-white p-6 space-y-5 max-w-2xl">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div className="space-y-2">
          <Label htmlFor="board">게시판</Label>
          <FormSelect id="board" name="board" defaultValue={defaultValues?.board ?? "공지사항"}>
            <option value="공지사항">공지사항</option>
            <option value="자주 묻는 질문">자주 묻는 질문</option>
          </FormSelect>
        </div>

        <div className="space-y-2">
          <Label htmlFor="status">상태</Label>
          <FormSelect id="status" name="status" defaultValue={defaultValues?.status ?? "게시중"}>
            <option value="게시중">게시중</option>
            <option value="숨김">숨김</option>
          </FormSelect>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="title">
          제목 <span className="text-destructive">*</span>
        </Label>
        <Input id="title" name="title" required defaultValue={defaultValues?.title} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="content">
          내용 <span className="text-destructive">*</span>
        </Label>
        <Textarea id="content" name="content" rows={8} required defaultValue={defaultValues?.content} />
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
