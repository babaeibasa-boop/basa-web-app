import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, AdminAuthProvider, useAuth, useAdminAuth } from "@/hooks/use-auth";
import { ToastProvider } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/badge";
import SplashPage from "@/pages/user/SplashPage";
import OrdersPage from "@/pages/user/OrdersPage";
import OrderDetailPage from "@/pages/user/OrderDetailPage";
import CreateOrderPage from "@/pages/user/CreateOrderPage";
import PaymentResultPage from "@/pages/user/PaymentResultPage";

const AdminLoginPage = lazy(() => import("@/pages/admin/AdminLoginPage"));
const AdminDashboardPage = lazy(() => import("@/pages/admin/AdminDashboardPage"));
const AdminOrdersPage = lazy(() => import("@/pages/admin/AdminOrdersPage"));
const AdminOrderDetailPage = lazy(() => import("@/pages/admin/AdminOrderDetailPage"));
const AdminUsersPage = lazy(() => import("@/pages/admin/AdminUsersPage"));
const AdminSettingsPage = lazy(() => import("@/pages/admin/AdminSettingsPage"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30_000 },
  },
});

function UserGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function AdminGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAdminAuth();
  if (!isAuthenticated) return <Navigate to="/admin/login" replace />;
  return <>{children}</>;
}

function PageFallback() {
  return (
    <div className="mx-auto max-w-3xl space-y-3 px-4 py-6">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AdminAuthProvider>
          <ToastProvider>
            <BrowserRouter>
              <Suspense fallback={<PageFallback />}>
                <Routes>
                  <Route path="/" element={<SplashPage />} />
                  <Route path="/orders" element={<UserGuard><OrdersPage /></UserGuard>} />
                  <Route path="/orders/new" element={<UserGuard><CreateOrderPage /></UserGuard>} />
                  <Route path="/orders/:id" element={<UserGuard><OrderDetailPage /></UserGuard>} />
                  <Route path="/payment/result" element={<UserGuard><PaymentResultPage /></UserGuard>} />
                  <Route path="/admin/login" element={<AdminLoginPage />} />
                  <Route path="/admin" element={<AdminGuard><AdminDashboardPage /></AdminGuard>} />
                  <Route path="/admin/orders" element={<AdminGuard><AdminOrdersPage /></AdminGuard>} />
                  <Route path="/admin/orders/:id" element={<AdminGuard><AdminOrderDetailPage /></AdminGuard>} />
                  <Route path="/admin/users" element={<AdminGuard><AdminUsersPage /></AdminGuard>} />
                  <Route path="/admin/settings" element={<AdminGuard><AdminSettingsPage /></AdminGuard>} />
                  <Route path="*" element={<Navigate to="/orders" replace />} />
                </Routes>
              </Suspense>
            </BrowserRouter>
          </ToastProvider>
        </AdminAuthProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
