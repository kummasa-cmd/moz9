"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { Mail, CheckCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

type FormValues = {
  email: string;
  name?: string;
};

export function SubscribeForm() {
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>();

  const onSubmit = async (data: FormValues) => {
    setSubmitError(null);
    const supabase = createClient();
    const { error } = await supabase.from("newsletter_subscribers").insert({
      email: data.email.trim().toLowerCase(),
      name: data.name?.trim() || null,
      source: "WEBSITE",
    });

    if (error) {
      setSubmitError(
        error.code === "23505"
          ? "이미 구독 중인 이메일입니다."
          : "구독 신청 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
      );
      return;
    }

    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
        <CheckCircle size={40} className="text-primary" />
        <h2 className="text-lg font-bold text-foreground">구독 신청이 완료되었습니다!</h2>
        <p className="text-muted-foreground text-sm">
          앞으로 새 뉴스레터를 이메일로 보내드릴게요.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="subscribe-email">
          이메일 <span className="text-destructive">*</span>
        </Label>
        <Input
          id="subscribe-email"
          type="email"
          placeholder="hello@example.com"
          {...register("email", {
            required: "이메일을 입력해 주세요",
            pattern: { value: /^\S+@\S+$/i, message: "올바른 이메일을 입력해 주세요" },
          })}
        />
        {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="subscribe-name">이름 (선택)</Label>
        <Input id="subscribe-name" placeholder="홍길동" {...register("name")} />
      </div>

      {submitError && <p className="text-sm text-destructive">{submitError}</p>}

      <button
        type="submit"
        disabled={isSubmitting}
        className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
      >
        <Mail size={15} />
        {isSubmitting ? "신청 중..." : "구독하기"}
      </button>

      <p className="text-xs text-muted-foreground">
        구독 시 뉴스레터 수신에 동의하는 것으로 간주됩니다. 발송되는 이메일 하단 링크로 언제든
        수신거부할 수 있습니다.
      </p>
    </form>
  );
}
