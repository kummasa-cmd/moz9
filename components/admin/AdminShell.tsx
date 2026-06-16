"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, ExternalLink, LogOut } from "lucide-react";
import AdminSidebar from "./AdminSidebar";
import { findActiveTitle } from "./adminNav";
import { logout } from "@/app/admin/login/actions";

export default function AdminShell({
  children,
  adminName,
}: {
  children: React.ReactNode;
  adminName?: string;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pathname = usePathname();
  const title = findActiveTitle(pathname);

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className="hidden md:block w-60 flex-shrink-0 bg-[#0F172A] sticky top-0 h-screen overflow-y-auto">
        <AdminSidebar />
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="absolute top-0 left-0 w-60 h-full bg-[#0F172A] overflow-y-auto">
            <AdminSidebar onNavigate={() => setDrawerOpen(false)} />
          </div>
        </div>
      )}

      {/* Main column */}
      <div className="flex-1 flex flex-col min-w-0 bg-muted/30">
        <header className="sticky top-0 z-30 h-16 flex items-center justify-between gap-4 border-b border-border bg-white px-4 sm:px-6">
          <div className="flex items-center gap-3 min-w-0">
            <button
              className="md:hidden p-2 -ml-2 text-muted-foreground"
              onClick={() => setDrawerOpen(true)}
              aria-label="메뉴 열기"
            >
              <Menu size={20} />
            </button>
            <h1 className="font-semibold text-foreground truncate">{title}</h1>
          </div>

          <div className="flex items-center gap-4 flex-shrink-0">
            <Link
              href="/"
              target="_blank"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors"
            >
              사이트 보기 <ExternalLink size={14} />
            </Link>

            {adminName && (
              <span className="hidden sm:inline text-sm text-muted-foreground">{adminName}님</span>
            )}

            <form action={logout}>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors"
              >
                <LogOut size={14} /> 로그아웃
              </button>
            </form>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
