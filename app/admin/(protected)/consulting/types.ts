export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

export type AdminConsultationRow = {
  id: string;
  number: number;
  name: string;
  subject: string;
  channel: string;
  status: string;
  createdAt: string;
};
