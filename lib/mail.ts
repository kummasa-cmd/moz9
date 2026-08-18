import { Resend } from "resend";
import type { SupabaseClient } from "@supabase/supabase-js";

const SENDER_NAME = process.env.NEWSLETTER_SENDER_NAME || "모즈나인";
const SENDER_EMAIL = process.env.NEWSLETTER_SENDER_EMAIL || "";
const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function stripHtmlPreview(html: string, maxLength = 300): string {
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

type NotificationEmailOptions = {
  heading: string;
  meta: { label: string; value: string }[];
  preview?: string;
  ctaPath?: string;
  ctaLabel?: string;
};

function renderNotificationEmail(opts: NotificationEmailOptions): string {
  const metaRows = opts.meta
    .map(
      (m) =>
        `<tr><td style="padding:4px 12px 4px 0;color:#6B7280;font-size:13px;white-space:nowrap;">${escapeHtml(m.label)}</td><td style="padding:4px 0;color:#1A1A2E;font-size:13px;">${escapeHtml(m.value)}</td></tr>`
    )
    .join("");

  return `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f4f4f5;font-family:'Pretendard','Inter',-apple-system,sans-serif;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;padding:32px;border-radius:12px;">
      <h1 style="margin:0 0 20px;font-size:18px;color:#1A1A2E;">${escapeHtml(opts.heading)}</h1>
      <table style="border-collapse:collapse;margin-bottom:16px;">${metaRows}</table>
      ${
        opts.preview
          ? `<div style="white-space:pre-wrap;font-size:14px;color:#1A1A2E;line-height:1.6;padding:16px;background:#f9fafb;border-radius:8px;">${escapeHtml(opts.preview)}</div>`
          : ""
      }
      ${
        opts.ctaPath
          ? `<p style="margin-top:24px;"><a href="${SITE_URL}${opts.ctaPath}" style="display:inline-block;background:#3B5BFF;color:#ffffff;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:14px;">${escapeHtml(opts.ctaLabel ?? "바로 확인하기")}</a></p>`
          : ""
      }
    </div>
  </body>
</html>`;
}

async function sendMail(opts: { to: string; subject: string; html: string }): Promise<void> {
  if (!RESEND_API_KEY || !SENDER_EMAIL) {
    console.warn("[mail] RESEND_API_KEY 또는 NEWSLETTER_SENDER_EMAIL이 설정되지 않아 메일 발송을 건너뜁니다.");
    return;
  }
  try {
    const resend = new Resend(RESEND_API_KEY);
    await resend.emails.send({
      from: `${SENDER_NAME} <${SENDER_EMAIL}>`,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
    });
  } catch (err) {
    console.error("[mail] 발송 실패:", err);
  }
}

export async function getCompanyEmail(db: SupabaseClient): Promise<string | null> {
  const { data } = await db.from("site_settings").select("email").eq("id", 1).maybeSingle();
  return (data?.email as string | undefined) ?? null;
}

// Sent to the company email (사이트관리 > 메인관리) when a new inquiry lands on
// one of the three 상담관리 boards (상담 게시판 / 1대1 문의 / 거래처 게시판).
export async function notifyAdminNewSubmission(
  db: SupabaseClient,
  opts: {
    boardLabel: string;
    title: string;
    authorName: string;
    authorEmail: string;
    preview?: string;
    ctaPath: string;
  }
): Promise<void> {
  const companyEmail = await getCompanyEmail(db);
  if (!companyEmail) return;

  const html = renderNotificationEmail({
    heading: `[${opts.boardLabel}] 새 문의가 접수되었습니다`,
    meta: [
      { label: "게시판", value: opts.boardLabel },
      { label: "제목", value: opts.title },
      { label: "작성자", value: opts.authorName },
      { label: "이메일", value: opts.authorEmail },
    ],
    preview: opts.preview,
    ctaPath: opts.ctaPath,
    ctaLabel: "관리페이지에서 확인하기",
  });

  await sendMail({ to: companyEmail, subject: `[${opts.boardLabel}] ${opts.title}`, html });
}

// Sent to the company email when a new member signs up (register/actions.ts).
export async function notifyAdminNewMemberSignup(
  db: SupabaseClient,
  opts: { name: string; nickname: string; email: string }
): Promise<void> {
  const companyEmail = await getCompanyEmail(db);
  if (!companyEmail) return;

  const html = renderNotificationEmail({
    heading: "새 회원이 가입했습니다",
    meta: [
      { label: "이름", value: opts.name },
      { label: "닉네임", value: opts.nickname },
      { label: "이메일", value: opts.email },
    ],
    ctaPath: "/admin/members",
    ctaLabel: "회원관리에서 확인하기",
  });

  await sendMail({ to: companyEmail, subject: `[신규 회원가입] ${opts.nickname} (${opts.email})`, html });
}

// Sent to the original author's email when an admin replies on one of the
// three 상담관리 boards.
export async function notifySubmitterReply(opts: {
  boardLabel: string;
  title: string;
  toEmail: string;
  reply: string;
  ctaPath?: string;
}): Promise<void> {
  if (!opts.toEmail) return;

  const html = renderNotificationEmail({
    heading: `[${opts.boardLabel}] 문의하신 내용에 답변이 등록되었습니다`,
    meta: [
      { label: "게시판", value: opts.boardLabel },
      { label: "제목", value: opts.title },
    ],
    preview: opts.reply,
    ctaPath: opts.ctaPath,
    ctaLabel: "답변 확인하기",
  });

  await sendMail({ to: opts.toEmail, subject: `[${opts.boardLabel}] 답변 등록: ${opts.title}`, html });
}
