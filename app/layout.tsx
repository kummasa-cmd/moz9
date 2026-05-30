import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "모즈나인 | 작가·1인 크리에이터를 위한 디지털 운영 파트너",
  description:
    "책 쓴 사람, 작가, 전문직을 위한 디지털 콘텐츠 제작 및 운영 파트너. 홍성호와 함께 당신의 전문성을 디지털 세계에 구현하세요.",
  keywords: ["작가", "1인 사업가", "홈페이지 제작", "디지털 콘텐츠", "모즈나인"],
  openGraph: {
    title: "모즈나인 | 작가·1인 크리에이터를 위한 디지털 운영 파트너",
    description: "책 쓴 사람, 작가, 전문직을 위한 디지털 콘텐츠 제작 및 운영 파트너.",
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
      <body className="min-h-full flex flex-col">
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
