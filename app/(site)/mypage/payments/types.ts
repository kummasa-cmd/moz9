export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

export type MyPaymentRow = {
  id: string;
  number: number;
  orderCode: string;
  companyName: string | null;
  managerName: string | null;
  category: string;
  productName: string | null;
  contractStart: string | null;
  contractEnd: string | null;
  paidAmount: number;
  status: string;
};
