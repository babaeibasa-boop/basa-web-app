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
