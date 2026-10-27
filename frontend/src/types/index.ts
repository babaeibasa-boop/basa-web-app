export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

export interface User {
  id: string;
  name: string;
  family: string;
  phone: string;
  hasNationalCode?: boolean;
  isDeveloper?: boolean;
}

export interface Invoice {
  id: string;
  orderId: string;
  amount: string;
  status: string;
  paymentTrackId: string | null;
  paymentToken: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Order {
  id: string;
  userId: string;
  aiModel: string;
  selectedPlan: string;
  selectedPlanUsdValue: number;
  status: string;
  createdAt: string;
  updatedAt: string;
  invoices: Invoice[];
  user?: User;
  credentials?: Record<string, string>;
}

export interface SubscriptionPlan {
  title: string;
  usdValue: number;
  irrPrice: number;
}

export interface SubscriptionProduct {
  name: string;
  plans: SubscriptionPlan[];
}

export interface Admin {
  id: string;
  username: string;
  fullName: string;
  phones: { id: string; phone: string }[];
}

export interface DashboardStats {
  totalOrders: number;
  pendingOrders: number;
  completedOrders: number;
  totalUsers: number;
}

export interface PaginatedResult<T> {
  items?: T[];
  orders?: Order[];
  users?: User[];
  total: number;
  page: number;
  limit: number;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface ReftekCatalogItem {
  kind: "app" | "voucher";
  id: string;
  name: string;
  icon: string;
  description: string | null;
  categorySlug: string;
  categoryName: string;
  linkType?: "static" | "dynamic";
  platformSlug?: string;
}

export interface VoucherPlatform {
  id: string;
  name: string;
  slug: string;
  logoUrl: string;
  hasApiKey?: boolean;
  category?: Category;
  createdAt?: string;
  updatedAt?: string;
}

export interface AdminSettings {
  hideVouchersExpiringSoon: boolean;
}

export interface VoucherImportResult {
  created: number;
  failed: number;
  errors: { row: number; message: string }[];
}

export interface VoucherOffer {
  amount: string;
  duration: string;
  expiresAt: string | null;
  availableCount: number;
}

export interface VoucherPlatformDetail {
  platform: VoucherPlatform;
  offers: VoucherOffer[];
}

export interface VoucherPurchase {
  id: string;
  amount: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  voucher: {
    id: string;
    duration: string;
    expiresAt: string | null;
    status: string;
    platform: VoucherPlatform;
    code: string | null;
  };
}

export interface AdminVoucher {
  id: string;
  amount: string;
  duration: string;
  expiresAt: string | null;
  status: string;
  code: string;
  createdAt: string;
  platform: VoucherPlatform;
}

export interface VoucherSale {
  id: string;
  amount: string;
  status: string;
  createdAt: string;
  user: User;
  voucher: {
    id: string;
    duration: string;
    expiresAt: string | null;
    code: string;
    platform: VoucherPlatform;
  };
}

export type CreditFeatureMode = "API" | "REDIRECT" | "DISABLED";

export interface CreditBalance {
  available: number;
  total?: number;
  currency: string;
  expiresAt?: string | null;
}

export interface CreditPlatformSummary {
  id: string;
  name: string;
  slug: string;
  logoUrl: string;
  installmentsMode: CreditFeatureMode;
  installmentsUrl: string | null;
  merchantsMode: CreditFeatureMode;
  merchantsUrl: string | null;
  hasLaunch: boolean;
  instructions: string;
  isActive: boolean;
  sortOrder: number;
  balance: CreditBalance | null;
  error: string | null;
}

export interface CreditPlatformDetail {
  id: string;
  name: string;
  slug: string;
  logoUrl: string;
  installmentsMode: CreditFeatureMode;
  installmentsUrl: string | null;
  merchantsMode: CreditFeatureMode;
  merchantsUrl: string | null;
  hasLaunch: boolean;
  instructions: string;
  sortOrder: number;
}

export interface CreditTransaction {
  id: string;
  amount: number;
  type: "PURCHASE" | "REFUND" | "CHARGE" | "INSTALLMENT_PAYMENT" | "OTHER";
  status: "SUCCESS" | "PENDING" | "FAILED";
  description: string | null;
  occurredAt: string;
  merchantName?: string | null;
}

export interface CreditInstallment {
  id: string;
  amount: number;
  dueAt: string;
  status: "PAID" | "DUE" | "OVERDUE" | "UPCOMING";
  label?: string | null;
}

export interface CreditMerchant {
  id: string;
  name: string;
  logoUrl?: string | null;
  category?: string | null;
  url?: string | null;
}

export interface CreditCursorPage<T> {
  items: T[];
  nextCursor?: string | null;
}

export interface CreditAdapterInfo {
  key: string;
  label: string;
  capabilities: {
    installments: boolean;
    merchants: boolean;
    launch: boolean;
  };
  configTemplate: Record<string, unknown>;
  configNotes: string[];
}

export interface AdminCreditPlatform {
  id: string;
  name: string;
  slug: string;
  logoUrl: string;
  adapterKey: string;
  hasConfig: boolean;
  installmentsMode: CreditFeatureMode;
  installmentsUrl: string | null;
  merchantsMode: CreditFeatureMode;
  merchantsUrl: string | null;
  launchUrl: string | null;
  instructions: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}
