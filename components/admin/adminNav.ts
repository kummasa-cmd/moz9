export type AdminNavChild = {
  label: string;
  href: string;
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
    label: "주문관리",
    href: "/admin/orders",
    children: [
      { label: "주문목록", href: "/admin/orders" },
      { label: "주문등록", href: "/admin/orders/new" },
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
      { label: "관리자관리", href: "/admin/site/admins" },
    ],
  },
];

export function findActiveTitle(pathname: string): string {
  for (const item of adminNav) {
    if (item.children) {
      const child = item.children.find((c) => c.href === pathname);
      if (child) return `${item.label} · ${child.label}`;
    }
    if (item.href === pathname) return item.label;
  }
  return "관리자";
}
