import net from "node:net";
import { domainToASCII } from "node:url";
import { NextRequest, NextResponse } from "next/server";

const WHOIS_PORT = 43;
const WHOIS_TIMEOUT_MS = 5000;
const WHOIS_SERVERS = {
  kr: "whois.kr",
  "co.kr": "whois.kr",
  com: "whois.verisign-grs.com",
} as const;
const ALLOWED_TLDS = Object.keys(WHOIS_SERVERS) as (keyof typeof WHOIS_SERVERS)[];

const RATE_LIMIT_MAX = 15;
const RATE_LIMIT_WINDOW_MS = 60_000;
const requestLog = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const timestamps = (requestLog.get(ip) ?? []).filter(
    (t) => now - t < RATE_LIMIT_WINDOW_MS,
  );
  if (timestamps.length >= RATE_LIMIT_MAX) {
    requestLog.set(ip, timestamps);
    return true;
  }
  timestamps.push(now);
  requestLog.set(ip, timestamps);
  return false;
}

function whoisQuery(query: string, host: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port: WHOIS_PORT });
    let data = "";

    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error("WHOIS lookup timed out"));
    }, WHOIS_TIMEOUT_MS);

    socket.on("connect", () => {
      socket.write(query + "\r\n");
    });
    socket.on("data", (chunk) => {
      data += chunk.toString("utf8");
    });
    socket.on("end", () => {
      clearTimeout(timer);
      resolve(data);
    });
    socket.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

type Availability = "available" | "registered" | "unknown";

function parseAvailability(raw: string): Availability {
  const text = raw.toLowerCase();
  if (
    text.includes("no match") ||
    text.includes("not found") ||
    text.includes("no data found") ||
    text.includes("등록되어 있지 않")
  ) {
    return "available";
  }
  if (
    text.includes("registrant") ||
    text.includes("등록인") ||
    text.includes("등록일") ||
    text.includes("registered date") ||
    text.includes("domain name:") ||
    text.includes("creation date") ||
    text.includes("registrar:")
  ) {
    return "registered";
  }
  return "unknown";
}

export async function GET(request: NextRequest) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";

  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." },
      { status: 429 },
    );
  }

  const sld = (request.nextUrl.searchParams.get("name") ?? "").trim().toLowerCase();
  const tldParam = (request.nextUrl.searchParams.get("tld") ?? "").trim().toLowerCase();

  if (!sld || !ALLOWED_TLDS.includes(tldParam as (typeof ALLOWED_TLDS)[number])) {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }
  const tld = tldParam as keyof typeof WHOIS_SERVERS;

  if (!/^[a-z0-9가-힣]([a-z0-9가-힣-]{0,61}[a-z0-9가-힣])?$/.test(sld)) {
    return NextResponse.json(
      { error: "영문, 숫자, 한글, 하이픈(-)만 사용할 수 있어요." },
      { status: 400 },
    );
  }

  const domain = domainToASCII(`${sld}.${tldParam}`);
  if (!domain) {
    return NextResponse.json({ error: "사용할 수 없는 도메인 형식이에요." }, { status: 400 });
  }

  try {
    const raw = await whoisQuery(domain, WHOIS_SERVERS[tld]);
    const availability = parseAvailability(raw);
    return NextResponse.json({ domain: `${sld}.${tldParam}`, availability });
  } catch {
    return NextResponse.json(
      { error: "조회 서버에 연결할 수 없어요. 잠시 후 다시 시도해 주세요." },
      { status: 502 },
    );
  }
}
