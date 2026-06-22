import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "모즈나인 | 작가·인플루언서를 위한 홈페이지 구독 서비스",
  description:
    "베스트셀러 작가가 운영하는 25년 경력 개발 스튜디오. 월 7만원부터 시작하는 작가 전용 홈페이지·콘텐츠·뉴스레터 통합 솔루션. 14일 무료 체험.",
  keywords: [
    "작가 홈페이지",
    "작가 웹사이트 제작",
    "뉴스레터 운영",
    "창작자 홈페이지",
    "인플루언서 사이트",
    "콘텐츠 구독 플랫폼",
  ],
  openGraph: {
    title: "모즈나인 | 작가·인플루언서를 위한 홈페이지 구독 서비스",
    description:
      "베스트셀러 작가가 운영하는 25년 경력 개발 스튜디오. 월 7만원부터 시작하는 작가 전용 홈페이지·콘텐츠·뉴스레터 통합 솔루션.",
    locale: "ko_KR",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className={`${inter.variable} h-full antialiased`}>
      <head>
        <link
          rel="stylesheet"
          as="style"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css"
        />
      </head>
      <body className="min-h-full antialiased">{children}</body>
    </html>
  );
}
