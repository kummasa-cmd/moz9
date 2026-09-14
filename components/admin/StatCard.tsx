import Link from "next/link";
import type { LucideIcon } from "lucide-react";

type StatCardProps = {
  label: string;
  value: string;
  hint?: string;
  icon: LucideIcon;
  href?: string;
};

export default function StatCard({ label, value, hint, icon: Icon, href }: StatCardProps) {
  const content = (
    <>
      <div>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold text-foreground mt-1">{value}</p>
        {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
      </div>
      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
        <Icon size={20} className="text-primary" />
      </div>
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="rounded-xl border border-border bg-white p-5 flex items-start justify-between hover:border-primary/50 hover:shadow-sm transition-all"
      >
        {content}
      </Link>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-white p-5 flex items-start justify-between">
      {content}
    </div>
  );
}
