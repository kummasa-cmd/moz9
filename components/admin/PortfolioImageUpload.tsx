"use client";

import { useState, useRef } from "react";
import { ImageIcon, X, Loader2 } from "lucide-react";

type Props = {
  name: string;
  defaultValue?: string | null;
};

export default function PortfolioImageUpload({ name, defaultValue }: Props) {
  const [url, setUrl] = useState<string>(defaultValue ?? "");
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      alert("이미지 파일만 업로드 가능합니다.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert("이미지 크기는 5MB 이하여야 합니다.");
      return;
    }

    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/portfolio-image", { method: "POST", body: fd });
    setUploading(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert((data as { error?: string }).error ?? "이미지 업로드에 실패했습니다.");
      return;
    }
    const { url: uploaded } = (await res.json()) as { url: string };
    setUrl(uploaded);
  };

  const handleRemove = () => {
    setUrl("");
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div>
      <input type="hidden" name={name} value={url} />
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        className="sr-only"
        id="portfolio-thumbnail-input"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />

      {url ? (
        <div className="relative w-48 h-36 rounded-lg overflow-hidden border border-border group">
          <img src={url} alt="썸네일 미리보기" className="w-full h-full object-cover" />
          <button
            type="button"
            onClick={handleRemove}
            className="absolute top-1.5 right-1.5 p-1 rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity"
            aria-label="이미지 제거"
          >
            <X size={12} />
          </button>
          <label
            htmlFor="portfolio-thumbnail-input"
            className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/20 cursor-pointer transition-colors"
            aria-label="이미지 변경"
          />
        </div>
      ) : (
        <label
          htmlFor="portfolio-thumbnail-input"
          className={`flex flex-col items-center justify-center w-48 h-36 rounded-lg border-2 border-dashed border-border cursor-pointer hover:border-primary hover:bg-primary/5 transition-colors${
            uploading ? " pointer-events-none opacity-60" : ""
          }`}
        >
          {uploading ? (
            <Loader2 size={24} className="text-muted-foreground animate-spin" />
          ) : (
            <>
              <ImageIcon size={24} className="text-muted-foreground mb-2" />
              <span className="text-xs text-muted-foreground text-center px-3">클릭하여 이미지 선택</span>
              <span className="text-xs text-muted-foreground/60 mt-1">최대 5MB</span>
            </>
          )}
        </label>
      )}
    </div>
  );
}
