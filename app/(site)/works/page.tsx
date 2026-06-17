import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink, Globe } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getOgImage } from "@/lib/og-image";

export const metadata: Metadata = {
  title: "제작사례 | 모즈나인",
  description: "모즈나인이 제작한 홈페이지 및 디지털 콘텐츠 포트폴리오",
};

const categories = ["전체", "홈페이지 제작", "랜딩 페이지", "포트폴리오", "콘텐츠 제작"];

type Props = {
  searchParams: Promise<{ category?: string }>;
};

export default async function WorksPage({ searchParams }: Props) {
  const { category } = await searchParams;
  const activeCategory = categories.includes(category ?? "") ? category! : "전체";

  const supabase = await createClient();
  let query = supabase
    .from("portfolio_items")
    .select("id, title, category, description, link, thumbnail_url")
    .eq("status", "공개")
    .order("created_at", { ascending: false });

  if (activeCategory !== "전체") {
    query = query.eq("category", activeCategory);
  }

  const { data: portfolios } = await query;

  const works = await Promise.all(
    (portfolios ?? []).map(async (p) => {
      let imageUrl: string | null = p.thumbnail_url ?? null;
      if (!imageUrl && p.link) {
        imageUrl = await getOgImage(p.link);
      }
      return { ...p, imageUrl };
    })
  );

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
      {/* Header */}
      <div className="max-w-2xl mb-12">
        <p className="text-sm font-medium text-accent uppercase tracking-widest mb-3">Works</p>
        <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">제작 사례</h1>
        <p className="text-muted-foreground leading-relaxed">
          작가, 전문직, 1인 사업가를 위해 제작한 디지털 작업물입니다.
        </p>
      </div>

      {/* Category filter */}
      <div className="flex flex-wrap gap-2 mb-10">
        {categories.map((cat) => {
          const href = cat === "전체" ? "/works" : `/works?category=${encodeURIComponent(cat)}`;
          const isActive = cat === activeCategory;
          return (
            <Link
              key={cat}
              href={href}
              className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                isActive
                  ? "bg-primary text-white border-primary"
                  : "border-border text-muted-foreground hover:border-primary hover:text-primary"
              }`}
            >
              {cat}
            </Link>
          );
        })}
      </div>

      {/* Works grid */}
      {works.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {works.map((work) => (
            <div
              key={work.id}
              className="rounded-xl border border-border bg-white overflow-hidden hover:shadow-md transition-shadow group"
            >
              {/* Thumbnail */}
              <div className="h-48 overflow-hidden bg-gradient-to-br from-blue-100 via-blue-50 to-amber-50">
                {work.imageUrl ? (
                  <img
                    src={work.imageUrl}
                    alt={work.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Globe size={40} className="text-primary/20" />
                  </div>
                )}
              </div>

              <div className="p-5">
                <p className="text-xs font-medium text-accent uppercase tracking-wider mb-1">
                  {work.category}
                </p>
                <h3 className="font-semibold text-foreground mb-2">{work.title}</h3>
                {work.description && (
                  <p className="text-sm text-muted-foreground leading-relaxed mb-4 line-clamp-3">
                    {work.description}
                  </p>
                )}

                {work.link && (
                  <a
                    href={work.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sm text-primary font-medium hover:underline"
                  >
                    사이트 보기 <ExternalLink size={13} />
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-20 text-muted-foreground">
          {activeCategory === "전체"
            ? "등록된 포트폴리오가 없습니다."
            : `'${activeCategory}' 카테고리에 등록된 포트폴리오가 없습니다.`}
        </div>
      )}
    </div>
  );
}
