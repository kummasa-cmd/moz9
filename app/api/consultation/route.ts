import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyAdminNewSubmission } from "@/lib/mail";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const name = String(body?.name ?? "").trim();
  const email = String(body?.email ?? "").trim();
  const phone = String(body?.phone ?? "").trim() || null;
  const subject = String(body?.subject ?? "").trim();
  const message = String(body?.message ?? "").trim();

  if (!name || !email || !subject || !message) {
    return NextResponse.json({ error: "필수 항목을 입력해 주세요." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin.from("consultations").insert({ name, email, phone, subject, message });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await notifyAdminNewSubmission(admin, {
    boardLabel: "상담 게시판",
    title: subject,
    authorName: name,
    authorEmail: email,
    preview: message,
    ctaPath: "/admin/consulting",
  });

  return NextResponse.json({ ok: true });
}
