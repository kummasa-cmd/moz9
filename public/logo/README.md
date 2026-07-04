# moznine 로고 자산 · 사용 가이드

## 📁 파일 구성

| 파일 | 용도 | 크기 |
|------|------|------|
| `moznine-logo-full.svg` | 라이트 조합형 (심볼 + 워드마크) | 400×200 |
| `moznine-logo-dark.svg` | 다크 조합형 | 400×200 |
| `moznine-symbol.svg` | 심볼 단독 | 200×120 |
| `favicon.svg` | 파비콘 (그라디언트 배경 + 화이트 심볼) | 64×64 |

## 🎨 브랜드 컬러 토큰

```css
:root {
  --moz-blue: #3B5BFF;        /* 그라디언트 시작 (라이트) */
  --moz-purple: #8B5CF6;      /* 그라디언트 끝 (라이트) */
  --moz-blue-dark: #5B7FFF;   /* 그라디언트 시작 (다크) */
  --moz-purple-dark: #A78BFA; /* 그라디언트 끝 (다크) */
  --moz-ink: #1A1A2E;         /* 워드마크 (라이트) */
  --moz-paper: #F5F5FA;       /* 워드마크 (다크) */
}
```

## 🚀 Next.js (moz9.vercel.app) 적용 방법

### 1. 파일 배치
```
public/
  favicon.svg
  moznine-logo-full.svg
  moznine-logo-dark.svg
  moznine-symbol.svg
```

### 2. `app/layout.tsx` — 파비콘 등록
```tsx
export const metadata = {
  title: "moznine — From Zero to Nine",
  description: "0에서 시작해 완성으로. 창작자를 위한 디지털 파트너.",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
  },
};
```

### 3. 헤더 컴포넌트 — 다크모드 자동 스위칭
```tsx
import Image from "next/image";

export function Logo() {
  return (
    <>
      <Image
        src="/moznine-logo-full.svg"
        alt="moznine"
        width={160}
        height={80}
        className="block dark:hidden"
        priority
      />
      <Image
        src="/moznine-logo-dark.svg"
        alt="moznine"
        width={160}
        height={80}
        className="hidden dark:block"
        priority
      />
    </>
  );
}
```

### 4. 인라인 SVG로 삽입할 경우 (애니메이션·색상 제어 유리)
`moznine-symbol.svg` 파일을 열어 그대로 JSX로 붙여넣기 → `stroke-width` → `strokeWidth` 등 kebab-case를 camelCase로 변환.

## ✍️ 타이포그래피 매칭

워드마크 SVG는 Playfair Display 계열을 참조합니다. 사이트 본문에도 동일한 감성을 유지하려면:

```tsx
// app/layout.tsx
import { Playfair_Display, Inter } from "next/font/google";

const playfair = Playfair_Display({ subsets: ["latin"], variable: "--font-serif" });
const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
```

- **디스플레이/헤드라인**: Playfair Display (세리프, 브랜드 톤)
- **본문**: Inter 또는 Pretendard (한글 병기 시 Pretendard 권장)

## 🎬 로고 애니메이션 아이디어 (옵션)

히어로 섹션에서 심볼이 한 획으로 그려지는 효과 — `stroke-dasharray` + `stroke-dashoffset`으로 구현.

```css
.moz-symbol path {
  stroke-dasharray: 400;
  stroke-dashoffset: 400;
  animation: draw 2s ease-out forwards;
}
@keyframes draw {
  to { stroke-dashoffset: 0; }
}
```

## 📢 브랜드 사용 원칙

- **최소 여백**: 심볼 높이의 50% 이상을 로고 사방에 확보
- **금지사항**: 그라디언트 색상 변경, 심볼 회전, 워드마크 분리해서 재배치
- **최소 크기**: 워드마크 기준 100px 폭 이상 (그 이하에서는 심볼 단독 사용)
