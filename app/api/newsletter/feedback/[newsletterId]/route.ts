import { NextRequest, NextResponse } from "next/server";
import { recordNewsletterFeedback } from "@/lib/newsletter/queries";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ newsletterId: string }> },
) {
  const { newsletterId } = await params;
  const type = request.nextUrl.searchParams.get("type");
  const slug = request.nextUrl.searchParams.get("slug") ?? "";

  const fallback = new URL("/newsletter", request.url);
  if (type !== "like" && type !== "dislike") {
    return NextResponse.redirect(fallback);
  }

  const redirectUrl = slug
    ? new URL(`/newsletter/${encodeURIComponent(slug)}?feedback=${type}`, request.url)
    : fallback;

  const voteCookieName = `nl_voted_${newsletterId}`;
  const alreadyVoted = request.cookies.get(voteCookieName)?.value === "1";

  if (!alreadyVoted) {
    await recordNewsletterFeedback(newsletterId, type);
  }

  const response = NextResponse.redirect(redirectUrl);
  if (!alreadyVoted) {
    response.cookies.set(voteCookieName, "1", {
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
      httpOnly: true,
      sameSite: "lax",
    });
  }
  return response;
}
