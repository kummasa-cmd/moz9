export const PAGE_SIZE_OPTIONS = [10, 20, 50];

export type PartnerPostRow = {
  id: string;
  number: number;
  title: string;
  status: string;
  createdAt: string;
  processedAt: string | null;
};
