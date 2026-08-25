export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

export type CommunityPostRow = {
  id: string;
  title: string;
  author: string | null;
  createdAt: string;
  isNotice: boolean;
  viewCount: number;
  editable: boolean;
  newsletterPublished: boolean | null;
};
