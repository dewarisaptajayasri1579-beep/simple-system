export interface BillItemOption {
  id: string;
  name: string;
  price: number | null;
  clientName: string | null;
}

export type LineKind = "manual" | "domain" | "server" | "maintenance" | "recurring_bill";

export interface LineDraft {
  kind: LineKind;
  categoryId: string;
  description: string;
  domainId: string;
  serverId: string;
  maintenanceId: string;
  recurringBillId: string;
  amount: number;
}

export const emptyLine = (): LineDraft => ({
  kind: "manual",
  categoryId: "",
  description: "",
  domainId: "",
  serverId: "",
  maintenanceId: "",
  recurringBillId: "",
  amount: 0,
});

export function formatRupiah(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n || 0);
}

export const KIND_OPTIONS = [
  { value: "manual", label: "Biaya Manual" },
  { value: "domain", label: "Bayar Domain" },
  { value: "server", label: "Bayar Server" },
  { value: "maintenance", label: "Bayar Maintenance" },
  { value: "recurring_bill", label: "Bayar Biaya Berkala" },
];
