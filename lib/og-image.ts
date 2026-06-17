import { unstable_cache } from "next/cache";

async function fetchOgImageFromUrl(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      },
    });

    clearTimeout(timer);

    if (!res.ok) return null;

    const html = await res.text();

    // og:image property in either attribute order
    const match =
      html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ??
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);

    if (!match?.[1]) return null;

    const imgUrl = match[1];
    if (imgUrl.startsWith("http")) return imgUrl;

    // Resolve relative URL
    const base = new URL(url);
    return new URL(imgUrl, base.origin).href;
  } catch {
    return null;
  }
}

// Cached across requests — revalidates every 24 hours
export const getOgImage = unstable_cache(
  (url: string) => fetchOgImageFromUrl(url),
  ["og-image"],
  { revalidate: 86400 }
);
