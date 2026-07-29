export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

export type AdminPartnerPostRow = {
  id: string;
  number: number;
  partnerName: string;
  title: string;
  status: string;
  createdAt: string;
  processedAt: string | null;
};

export type AdminPartnerComment = {
  id: string;
  authorName: string;
  content: string;
  isAdmin: boolean;
  createdAt: string;
};
