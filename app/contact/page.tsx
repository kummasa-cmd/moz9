"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { Send, CheckCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

type FormValues = {
  name: string;
  email: string;
  phone?: string;
  subject: string;
  message: string;
};

const socialLinks = [
  { label: "블로그", href: "https://blog.naver.com/kummasa", handle: "blog.naver.com/kummasa" },
  { label: "스레드", href: "https://www.threads.com/@kumma7", handle: "@kumma7" },
  { label: "X (트위터)", href: "https://x.com/kummasa4791", handle: "@kummasa4791" },
  { label: "인스타그램", href: "https://www.instagram.com/kumma7/", handle: "@kumma7" },
];

export default function ContactPage() {
  const [submitted, setSubmitted] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>();

  const onSubmit = async (data: FormValues) => {
    // TODO: connect to email service (e.g. Resend, Nodemailer)
    console.log(data);
    await new Promise((r) => setTimeout(r, 800));
    setSubmitted(true);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
      {/* Header */}
      <div className="max-w-2xl mb-12">
        <p className="text-sm font-medium text-accent uppercase tracking-widest mb-3">Contact</p>
        <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">무료 상담 · 견적 문의</h1>
        <p className="text-muted-foreground leading-relaxed">
          궁금한 점이 있거나 프로젝트 의뢰를 원하신다면 아래 폼을 작성해 주세요.
          <br />
          영업일 기준 1–2일 내에 답변 드립니다.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
        {/* Form */}
        <div className="lg:col-span-2">
          {submitted ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
              <CheckCircle size={48} className="text-primary" />
              <h2 className="text-xl font-bold text-foreground">문의가 접수되었습니다!</h2>
              <p className="text-muted-foreground text-sm">
                영업일 기준 1–2일 내에 이메일로 답변 드리겠습니다.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="name">
                    이름 <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="name"
                    placeholder="홍길동"
                    {...register("name", { required: "이름을 입력해 주세요" })}
                  />
                  {errors.name && (
                    <p className="text-xs text-destructive">{errors.name.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">
                    이메일 <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="hello@example.com"
                    {...register("email", {
                      required: "이메일을 입력해 주세요",
                      pattern: { value: /^\S+@\S+$/i, message: "올바른 이메일을 입력해 주세요" },
                    })}
                  />
                  {errors.email && (
                    <p className="text-xs text-destructive">{errors.email.message}</p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">휴대폰 번호 (선택)</Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="010-0000-0000"
                  {...register("phone")}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="subject">
                  제목 <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="subject"
                  placeholder="문의 제목을 입력해 주세요"
                  {...register("subject", { required: "제목을 입력해 주세요" })}
                />
                {errors.subject && (
                  <p className="text-xs text-destructive">{errors.subject.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="message">
                  메시지 <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  id="message"
                  rows={6}
                  placeholder="프로젝트 내용, 예산, 일정 등을 자유롭게 작성해 주세요"
                  {...register("message", { required: "메시지를 입력해 주세요" })}
                />
                {errors.message && (
                  <p className="text-xs text-destructive">{errors.message.message}</p>
                )}
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-6 py-3 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isSubmitting ? "전송 중..." : "문의 보내기"}
                <Send size={15} />
              </button>
            </form>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-8">
          <div>
            <h3 className="font-semibold text-foreground mb-3">이메일</h3>
            <a
              href="mailto:kummasa@naver.com"
              className="text-sm text-primary hover:underline"
            >
              kummasa@naver.com
            </a>
          </div>

          <div>
            <h3 className="font-semibold text-foreground mb-3">응답 시간</h3>
            <p className="text-sm text-muted-foreground">
              영업일 기준 1–2일 내 답변 드립니다.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-foreground mb-4">SNS</h3>
            <ul className="space-y-3">
              {socialLinks.map((s) => (
                <li key={s.label}>
                  <a
                    href={s.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex flex-col group"
                  >
                    <span className="text-xs text-muted-foreground">{s.label}</span>
                    <span className="text-sm text-foreground group-hover:text-primary transition-colors">
                      {s.handle}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
