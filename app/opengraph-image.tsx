import { ImageResponse } from "next/og";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";
export const alt = "모즈나인 | 작가·인플루언서를 위한 홈페이지 구독 서비스";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  const logoSvg = fs.readFileSync(
    path.join(process.cwd(), "public/logo/moznine-logo-full.svg"),
    "utf-8"
  );
  const logoDataUrl = `data:image/svg+xml;base64,${Buffer.from(logoSvg).toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "radial-gradient(circle at 50% 40%, #EEF1FF 0%, #FFFFFF 65%)",
        }}
      >
        <img src={logoDataUrl} width={560} height={280} alt="moznine" />
      </div>
    ),
    { ...size }
  );
}
