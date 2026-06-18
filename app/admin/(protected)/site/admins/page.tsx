import { Save, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormSelect } from "@/components/admin/FormSelect";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminSession } from "@/lib/admin-auth";
import { createAdmin, deleteAdmin } from "./actions";

type AdminsPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function AdminSiteAdminsPage({ searchParams }: AdminsPageProps) {
  const { error } = await searchParams;
  const sessionAdminId = await getAdminSession();

  const supabase = createAdminClient();
  const { data: admins } = await supabase
    .from("admins")
    .select("id, name, email, role, created_at")
    .order("created_at", { ascending: true });

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-foreground">관리자관리</h2>
        <p className="text-sm text-muted-foreground mt-1">관리자 계정과 권한을 관리합니다.</p>
      </div>

      <details className="rounded-xl border border-border bg-white mb-6 max-w-xl group">
        <summary className="cursor-pointer list-none px-6 py-4 font-medium text-sm text-foreground flex items-center justify-between">
          관리자 추가
          <span className="text-muted-foreground text-xs group-open:hidden">열기</span>
          <span className="text-muted-foreground text-xs hidden group-open:inline">닫기</span>
        </summary>

        <form action={createAdmin} className="px-6 pb-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="name">
                이름 <span className="text-destructive">*</span>
              </Label>
              <Input id="name" name="name" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">
                이메일 <span className="text-destructive">*</span>
              </Label>
              <Input id="email" name="email" type="email" required />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="password">
                비밀번호 <span className="text-destructive">*</span>
              </Label>
              <Input id="password" name="password" type="password" required minLength={6} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">권한</Label>
              <FormSelect id="role" name="role" defaultValue="운영자">
                <option value="운영자">운영자</option>
                <option value="최고관리자">최고관리자</option>
              </FormSelect>
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <button
            type="submit"
            className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
          >
            <Save size={15} />
            관리자 추가
          </button>
        </form>
      </details>

      <div className="rounded-xl border border-border bg-white overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>이름</TableHead>
              <TableHead>이메일</TableHead>
              <TableHead>권한</TableHead>
              <TableHead>등록일</TableHead>
              <TableHead className="text-right">관리</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(admins ?? []).map((a) => (
              <TableRow key={a.id}>
                <TableCell className="font-medium">{a.name}</TableCell>
                <TableCell className="text-muted-foreground">{a.email}</TableCell>
                <TableCell className="text-muted-foreground">{a.role}</TableCell>
                <TableCell className="text-muted-foreground">
                  {new Date(a.created_at).toLocaleDateString("ko-KR")}
                </TableCell>
                <TableCell className="text-right">
                  {sessionAdminId !== a.id && (
                    <form action={deleteAdmin}>
                      <input type="hidden" name="id" value={a.id} />
                      <button
                        type="submit"
                        className="text-muted-foreground hover:text-destructive transition-colors"
                        aria-label="삭제"
                      >
                        <Trash2 size={15} />
                      </button>
                    </form>
                  )}
                </TableCell>
              </TableRow>
            ))}

            {admins && admins.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-10">
                  등록된 관리자가 없습니다.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
