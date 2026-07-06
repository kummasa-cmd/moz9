import { ImageResponse } from "next/og";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  const svg = fs.readFileSync(
    path.join(process.cwd(), "public/logo/favicon.svg"),
    "utf-8"
  );
  const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
        }}
      >
        <img src={dataUrl} width={32} height={32} alt="moznine" />
      </div>
    ),
    { ...size }
  );
}
