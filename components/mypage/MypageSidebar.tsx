"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, MessageCircle, ShoppingBag, CreditCard, UserCog, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { logout } from "@/app/(site)/login/actions";

const navItems = [
  { href: "/mypage", label: "대시보드", icon: LayoutDashboard, exact: true },
  { href: "/mypage/consultations", label: "상담 내역", icon: MessageCircle },
  { href: "/mypage/orders", label: "주문 내역", icon: ShoppingBag },
  { href: "/mypage/payments", label: "결제 내역", icon: CreditCard },
  { href: "/mypage/profile", label: "회원정보 수정", icon: UserCog },
];

type Props = {
  nickname: string;
  email: string;
};

export default function MypageSidebar({ nickname, email }: Props) {
  const pathname = usePathname();

  return (
    <aside className="w-52 flex-shrink-0">
      {/* Profile summary */}
      <div className="rounded-xl border border-border bg-white px-5 py-4 mb-4">
        <p className="text-sm font-semibold text-foreground truncate">{nickname}</p>
        <p className="text-xs text-muted-foreground truncate mt-0.5">{email}</p>
      </div>

      {/* Navigation */}
      <nav className="rounded-xl border border-border bg-white overflow-hidden">
        <ul className="divide-y divide-border">
          {navItems.map(({ href, label, icon: Icon, exact }) => {
            const isActive = exact ? pathname === href : pathname.startsWith(href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  className={cn(
                    "flex items-center gap-2.5 px-4 py-3 text-sm transition-colors",
                    isActive
                      ? "bg-primary/5 text-primary font-medium"
                      : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                  )}
                >
                  <Icon size={15} />
                  {label}
                </Link>
              </li>
            );
          })}
          <li>
            <form action={logout}>
              <button
                type="submit"
                className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-muted-foreground hover:bg-muted/50 hover:text-destructive transition-colors"
              >
                <LogOut size={15} />
                로그아웃
              </button>
            </form>
          </li>
        </ul>
      </nav>
    </aside>
  );
}
