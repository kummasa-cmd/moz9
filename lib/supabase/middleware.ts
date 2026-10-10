import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { adminSessionV2Config, verifyAdminSessionCookie } from "@/lib/admin-session/config";
import { adminGateDecision } from "@/lib/admin-session/proxy-gate";

const MEMBER_PROTECTED = ["/mypage"];

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const { pathname } = request.nextUrl;
  const isAdminRoute = pathname.startsWith("/admin");

  if (isAdminRoute) {
    // Verify the session signature/expiry here (not just cookie presence):
    // Server Actions run without the (protected) layout's check.
    const session = await verifyAdminSessionCookie(
      request.cookies.get(adminSessionV2Config(process.env).cookie.name)?.value,
      process.env,
    );
    const decision = adminGateDecision(pathname, session);

    if (decision.action === "redirect") {
      const loginUrl = new URL("/admin/login", request.url);
      loginUrl.searchParams.set("redirect", decision.from);
      return NextResponse.redirect(loginUrl);
    }

    return response;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  const isMemberProtected = MEMBER_PROTECTED.some((p) => pathname.startsWith(p));

  if (isMemberProtected) {
    if (!user) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }

    const admin = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data: member } = await admin
      .from("members")
      .select("id, status")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!member || member.status === "탈퇴") {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set(
        "error",
        member ? "탈퇴한 회원입니다." : "회원 정보를 찾을 수 없습니다."
      );
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return response;
}
