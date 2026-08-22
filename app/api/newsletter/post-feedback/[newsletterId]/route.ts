import { NextRequest, NextResponse } from "next/server";
import { recordNewsletterPostFeedback } from "@/lib/newsletter/queries";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ newsletterId: string }> },
) {
  const { newsletterId } = await params;
  const type = request.nextUrl.searchParams.get("type");
  const slug = request.nextUrl.searchParams.get("slug") ?? "";
  const postId = request.nextUrl.searchParams.get("postId") ?? "";

  const fallback = new URL("/newsletter", request.url);
  if ((type !== "like" && type !== "dislike") || !postId || !slug) {
    return NextResponse.redirect(fallback);
  }

  const redirectUrl = new URL(
    `/newsletter/${encodeURIComponent(slug)}?postFeedback=${type}&postFeedbackId=${postId}#post-${postId}`,
    request.url,
  );

  const voteCookieName = `nl_voted_post_${newsletterId}_${postId}`;
  const existingVote = request.cookies.get(voteCookieName)?.value;
  const alreadyVoted = existingVote === "like" || existingVote === "dislike";

  if (!alreadyVoted) {
    await recordNewsletterPostFeedback(newsletterId, postId, type);
  }

  const response = NextResponse.redirect(redirectUrl);
  if (!alreadyVoted) {
    // Cookie value is the vote type itself (not just "1") so the page can
    // tell the reader which way they voted if they try to vote again —
    // see PostFeedbackButtons' already-voted alert.
    response.cookies.set(voteCookieName, type, {
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
      httpOnly: true,
      sameSite: "lax",
    });
  }
  return response;
}
