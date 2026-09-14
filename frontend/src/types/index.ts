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

export interface ReftekApp {
  appId: string;
  name: string;
  category: string;
  icon: string;
  description: string | null;
  linkType: "static" | "dynamic";
}

export interface VoucherPlatform {
  id: string;
  name: string;
  slug: string;
  logoUrl: string;
  hasApiKey?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface VoucherOffer {
  amount: string;
  duration: string;
  expiresAt: string;
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
    expiresAt: string;
    status: string;
    platform: VoucherPlatform;
    code: string | null;
  };
}

export interface AdminVoucher {
  id: string;
  amount: string;
  duration: string;
  expiresAt: string;
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
    expiresAt: string;
    code: string;
    platform: VoucherPlatform;
  };
}
