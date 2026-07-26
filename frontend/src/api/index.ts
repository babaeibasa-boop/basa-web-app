import api from "@/lib/api";
import type {
  ApiResponse,
  User,
  Order,
  SubscriptionProduct,
  Admin,
  DashboardStats,
  ReftekApp,
} from "@/types";

export const authApi = {
  walletLogin: (ut: string) =>
    api.post<unknown, ApiResponse<{ token: string; user: User }>>("/auth/wallet", { ut }),
  getProfile: () => api.get<unknown, ApiResponse<User>>("/auth/profile"),
};

export const orderApi = {
  getPlans: (model: string) =>
    api.get<unknown, ApiResponse<SubscriptionProduct>>(`/orders/plans/${model}`),
  getOrders: () => api.get<unknown, ApiResponse<Order[]>>("/orders"),
  getOrder: (id: string) => api.get<unknown, ApiResponse<Order>>(`/orders/${id}`),
  createOrder: (data: { aiModel: string; selectedPlan: string; credentials: Record<string, string> }) =>
    api.post<unknown, ApiResponse<Order>>("/orders", data),
};

export const paymentApi = {
  payInvoice: (invoiceId: string) =>
    api.post<unknown, ApiResponse<{ payUrl: string }>>(`/payments/invoices/${invoiceId}/pay`),
  verifyPayment: (data: { pt: string; pn: string; st: string }) =>
    api.post<unknown, ApiResponse<{ success: boolean; orderId: string }>>("/payments/verify", data),
};

export const reftekApi = {
  getApps: () => api.get<unknown, ApiResponse<ReftekApp[]>>("/reftek/apps"),
  launchApp: (appId: string) =>
    api.get<unknown, ApiResponse<{ url: string }>>(`/reftek/apps/${encodeURIComponent(appId)}/launch`),
};

export const adminApi = {
  login: (username: string, password: string) =>
    api.post<unknown, ApiResponse<{ token: string; admin: Admin }>>("/admin/login", { username, password }),
  getProfile: () => api.get<unknown, ApiResponse<Admin>>("/admin/profile"),
  getDashboard: () => api.get<unknown, ApiResponse<DashboardStats>>("/admin/dashboard"),
  getOrders: (params?: { status?: string; search?: string; page?: number }) =>
    api.get<unknown, ApiResponse<{ orders: Order[]; total: number; page: number; limit: number }>>("/admin/orders", { params }),
  getOrder: (id: string) => api.get<unknown, ApiResponse<Order>>(`/admin/orders/${id}`),
  updateOrderStatus: (id: string, status: string) =>
    api.patch<unknown, ApiResponse<Order>>(`/admin/orders/${id}/status`, { status }),
  updateOrderAmount: (id: string, amount: string) =>
    api.patch<unknown, ApiResponse<Order>>(`/admin/orders/${id}/amount`, { amount }),
  getUsers: (params?: { search?: string; page?: number }) =>
    api.get<unknown, ApiResponse<{ users: User[]; total: number; page: number; limit: number }>>("/admin/users", { params }),
  getPhones: () => api.get<unknown, ApiResponse<{ id: string; phone: string; admin: { fullName: string } }[]>>("/admin/phones"),
  addPhone: (phone: string) => api.post<unknown, ApiResponse<unknown>>("/admin/phones", { phone }),
  deletePhone: (id: string) => api.delete<unknown, ApiResponse<null>>(`/admin/phones/${id}`),
};
