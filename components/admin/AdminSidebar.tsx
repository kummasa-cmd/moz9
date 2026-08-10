"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { adminNav, type AdminNavChild } from "./adminNav";

function findOpenLabels(pathname: string) {
  for (const item of adminNav) {
    if (!item.children) continue;
    for (const child of item.children) {
      if (child.href === pathname) return { openLabel: item.label, openSubLabel: null as string | null };
      if (child.children?.some((g) => g.href === pathname)) {
        return { openLabel: item.label, openSubLabel: child.label };
      }
    }
  }
  return { openLabel: null as string | null, openSubLabel: null as string | null };
}

export default function AdminSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const [openLabel, setOpenLabel] = useState<string | null>(() => findOpenLabels(pathname).openLabel);
  const [openSubLabel, setOpenSubLabel] = useState<string | null>(
    () => findOpenLabels(pathname).openSubLabel,
  );

  useEffect(() => {
    const next = findOpenLabels(pathname);
    setOpenLabel(next.openLabel);
    setOpenSubLabel(next.openSubLabel);
  }, [pathname]);

  return (
    <nav className="flex flex-col py-6">
      <Link href="/admin" onClick={onNavigate} className="flex items-center gap-2 px-6 mb-6">
        <Image
          src="/logo/moznine-logo-dark.svg"
          alt="moznine"
          width={160}
          height={80}
          className="h-[36px] w-auto"
        />
        <span className="text-white/50 font-normal text-sm">admin</span>
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
          const hasActiveChild = item.children.some(
            (c) => c.href === pathname || c.children?.some((g) => g.href === pathname),
          );

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
                  {item.children.map((child) => (
                    <NavChildRow
                      key={child.href}
                      child={child}
                      pathname={pathname}
                      openSubLabel={openSubLabel}
                      setOpenSubLabel={setOpenSubLabel}
                      onNavigate={onNavigate}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </nav>
  );
}

function NavChildRow({
  child,
  pathname,
  openSubLabel,
  setOpenSubLabel,
  onNavigate,
}: {
  child: AdminNavChild;
  pathname: string;
  openSubLabel: string | null;
  setOpenSubLabel: (label: string | null) => void;
  onNavigate?: () => void;
}) {
  const isActive = pathname === child.href;

  if (!child.children) {
    return (
      <Link
        href={child.href}
        onClick={onNavigate}
        className={cn(
          "rounded-md px-3 py-1.5 text-sm transition-colors",
          isActive ? "bg-primary text-white font-medium" : "text-white/60 hover:bg-white/10 hover:text-white"
        )}
      >
        {child.label}
      </Link>
    );
  }

  const isOpen = openSubLabel === child.label;
  const hasActiveGrandchild = child.children.some((g) => g.href === pathname);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpenSubLabel(isOpen ? null : child.label)}
        aria-expanded={isOpen}
        className={cn(
          "w-full flex items-center justify-between rounded-md px-3 py-1.5 text-sm transition-colors",
          hasActiveGrandchild ? "text-white font-medium" : "text-white/60 hover:bg-white/10 hover:text-white"
        )}
      >
        {child.label}
        <ChevronDown
          size={12}
          className={cn("transition-transform text-white/40", isOpen && "rotate-180")}
        />
      </button>

      {isOpen && (
        <div className="mt-0.5 flex flex-col gap-0.5 border-l border-white/10 ml-3 pl-3">
          {child.children.map((grandchild) => {
            const isGrandchildActive = pathname === grandchild.href;
            return (
              <Link
                key={grandchild.href}
                href={grandchild.href}
                onClick={onNavigate}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs transition-colors",
                  isGrandchildActive
                    ? "bg-primary text-white font-medium"
                    : "text-white/50 hover:bg-white/10 hover:text-white"
                )}
              >
                {grandchild.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
