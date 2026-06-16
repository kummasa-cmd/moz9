"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { adminNav } from "./adminNav";

export default function AdminSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const [openLabel, setOpenLabel] = useState<string | null>(
    () => adminNav.find((item) => item.children?.some((c) => c.href === pathname))?.label ?? null
  );

  useEffect(() => {
    const activeGroup = adminNav.find((item) => item.children?.some((c) => c.href === pathname));
    if (activeGroup) setOpenLabel(activeGroup.label);
  }, [pathname]);

  return (
    <nav className="flex flex-col py-6">
      <Link
        href="/admin"
        onClick={onNavigate}
        className="px-6 mb-6 font-bold text-lg text-white tracking-tight"
      >
        moz9 <span className="text-white/50 font-normal text-sm">admin</span>
      </Link>

      <div className="flex flex-col gap-1 px-3">
        {adminNav.map((item) => {
          if (!item.children) {
            const isActive = item.href === pathname;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                className={cn(
                  "block rounded-md px-3 py-2 text-sm font-medium transition-colors mb-1",
                  isActive ? "bg-primary text-white" : "text-white/70 hover:bg-white/10 hover:text-white"
                )}
              >
                {item.label}
              </Link>
            );
          }

          const isOpen = openLabel === item.label;
          const hasActiveChild = item.children.some((c) => c.href === pathname);

          return (
            <div key={item.href} className="mb-1">
              <button
                type="button"
                onClick={() => setOpenLabel(isOpen ? null : item.label)}
                aria-expanded={isOpen}
                className={cn(
                  "w-full flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  hasActiveChild ? "text-white" : "text-white/90 hover:bg-white/10"
                )}
              >
                {item.label}
                <ChevronDown
                  size={14}
                  className={cn("transition-transform text-white/50", isOpen && "rotate-180")}
                />
              </button>

              {isOpen && (
                <div className="mt-0.5 flex flex-col gap-0.5 border-l border-white/10 ml-3 pl-3">
                  {item.children.map((child) => {
                    const isActive = pathname === child.href;
                    return (
                      <Link
                        key={child.href}
                        href={child.href}
                        onClick={onNavigate}
                        className={cn(
                          "rounded-md px-3 py-1.5 text-sm transition-colors",
                          isActive
                            ? "bg-primary text-white font-medium"
                            : "text-white/60 hover:bg-white/10 hover:text-white"
                        )}
                      >
                        {child.label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </nav>
  );
}
