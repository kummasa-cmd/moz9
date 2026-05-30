import Link from "next/link";

const socialLinks = [
  { label: "블로그", href: "https://blog.naver.com/kummasa" },
  { label: "스레드", href: "https://www.threads.com/@kumma7" },
  { label: "X", href: "https://x.com/kummasa4791" },
  { label: "인스타그램", href: "https://www.instagram.com/kumma7/" },
];

export default function Footer() {
  return (
    <footer className="border-t border-border bg-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="flex flex-col md:flex-row justify-between gap-6">
          <div className="space-y-1">
            <p className="font-bold text-lg text-primary">moz9</p>
            <p className="text-sm text-muted-foreground">
              작가·1인 크리에이터를 위한 디지털 운영 파트너
            </p>
            <p className="text-sm text-muted-foreground pt-1">
              상호명: 모즈나인 | 사업자번호: 830-06-01678
            </p>
            <p className="text-sm text-muted-foreground">
              서울시 금천구 범안로 1130. 3층 302호 (가산동, 디지털 엠파이어 빌딩)
            </p>
            <p className="text-sm text-muted-foreground">
              대표: 홍성호 | 010-6258-6933 |{" "}
              <a href="mailto:kummasa@naver.com" className="hover:text-primary transition-colors">
                kummasa@naver.com
              </a>
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-foreground">SNS</p>
            <div className="flex gap-4 flex-wrap">
              {socialLinks.map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-muted-foreground hover:text-primary transition-colors"
                >
                  {s.label}
                </a>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-border text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} 모즈나인. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
