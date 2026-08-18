export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

export type AdminPostRow = {
  id: string;
  number: number;
  title: string;
  author: string | null;
  createdAt: string;
  viewCount: number;
  status: string;
  isNotice: boolean;
  categoryName: string | null;
  commentCount: number;
  newsletterUseCount: number;
  newsletterLastUsedAt: string | null;
};
