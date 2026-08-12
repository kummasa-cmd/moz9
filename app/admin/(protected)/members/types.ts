export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

export type MemberRow = {
  id: string;
  name: string;
  nickname: string | null;
  email: string;
  phone: string | null;
  grade: string;
  status: string;
  isPartner: boolean;
  isColumnMember: boolean;
  createdAt: string;
};
