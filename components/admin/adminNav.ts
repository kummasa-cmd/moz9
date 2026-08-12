export type AdminNavChild = {
  label: string;
  href: string;
  children?: AdminNavChild[];
};

export type AdminNavItem = {
  label: string;
  href: string;
  children?: AdminNavChild[];
};

export const adminNav: AdminNavItem[] = [
  { label: "홈", href: "/admin" },
  {
    label: "회원관리",
    href: "/admin/members",
    children: [
      { label: "회원목록", href: "/admin/members" },
      { label: "회원등록", href: "/admin/members/new" },
    ],
  },
  {
    label: "포트폴리오관리",
    href: "/admin/portfolio",
    children: [
      { label: "포트폴리오 목록", href: "/admin/portfolio" },
      { label: "포트폴리오 등록", href: "/admin/portfolio/new" },
    ],
  },
  {
    label: "상품관리",
    href: "/admin/products",
    children: [
      { label: "상품목록", href: "/admin/products" },
      { label: "상품등록", href: "/admin/products/new" },
    ],
  },
  {
    label: "결제관리",
    href: "/admin/orders",
    children: [
      { label: "결제목록", href: "/admin/orders" },
      { label: "결제등록", href: "/admin/orders/new" },
      { label: "거래처목록", href: "/admin/orders/vendors" },
      { label: "거래처 게시판", href: "/admin/consulting/partner" },
    ],
  },
  {
    label: "상담관리",
    href: "/admin/consulting",
    children: [
      { label: "상담목록", href: "/admin/consulting" },
      { label: "1대1문의", href: "/admin/consulting/inquiry" },
    ],
  },
  {
    label: "컬럼관리",
    href: "/admin/site/board/a1111111-0000-4000-8000-000000000001/posts",
    children: [
      { label: "컬럼목록", href: "/admin/site/board/a1111111-0000-4000-8000-000000000001/posts" },
      { label: "연재목록", href: "/admin/site/board/a1111111-0000-4000-8000-000000000002/posts" },
      { label: "정보목록", href: "/admin/site/board/a1111111-0000-4000-8000-000000000003/posts" },
      { label: "광고목록", href: "/admin/site/board/a1111111-0000-4000-8000-000000000004/posts" },
    ],
  },
  {
    label: "통계",
    href: "/admin/stats/members",
    children: [
      { label: "회원가입현황", href: "/admin/stats/members" },
      { label: "상품판매현황", href: "/admin/stats/sales" },
      { label: "상담현황", href: "/admin/stats/consulting" },
    ],
  },
  {
    label: "사이트관리",
    href: "/admin/site/main",
    children: [
      { label: "메인관리", href: "/admin/site/main" },
      { label: "게시판관리", href: "/admin/site/board" },
      {
        label: "뉴스레터 관리",
        href: "/admin/site/newsletter/list",
        children: [
          { label: "뉴스레터 발송 관리", href: "/admin/site/newsletter/manage" },
          { label: "뉴스레터 발송 목록", href: "/admin/site/newsletter/list" },
          { label: "통계", href: "/admin/site/newsletter/analytics" },
        ],
      },
      { label: "관리자관리", href: "/admin/site/admins" },
    ],
  },
];

export function findActiveTitle(pathname: string): string {
  for (const item of adminNav) {
    if (item.children) {
      for (const child of item.children) {
        if (child.href === pathname) return `${item.label} · ${child.label}`;
        const grandchild = child.children?.find((g) => g.href === pathname);
        if (grandchild) return `${item.label} · ${child.label} · ${grandchild.label}`;
      }
    }
    if (item.href === pathname) return item.label;
  }
  return "관리자";
}
