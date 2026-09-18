import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation, useSearchParams } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, AdminAuthProvider, useAuth, useAdminAuth } from "@/hooks/use-auth";
import { ToastProvider } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/badge";
import { splashLoginSearch, voucherPlatformSlugFromPath } from "@/lib/utils";
import SplashPage from "@/pages/user/SplashPage";
import OrdersPage from "@/pages/user/OrdersPage";
import OrderDetailPage from "@/pages/user/OrderDetailPage";
import CreateOrderPage from "@/pages/user/CreateOrderPage";
import PaymentResultPage from "@/pages/user/PaymentResultPage";
import ReftekPage from "@/pages/user/ReftekPage";
import ReftekCategoryPage from "@/pages/user/ReftekCategoryPage";
import VoucherPlatformPage from "@/pages/user/VoucherPlatformPage";
import VoucherPurchasesPage from "@/pages/user/VoucherPurchasesPage";

const AdminLoginPage = lazy(() => import("@/pages/admin/AdminLoginPage"));
const AdminDashboardPage = lazy(() => import("@/pages/admin/AdminDashboardPage"));
const AdminOrdersPage = lazy(() => import("@/pages/admin/AdminOrdersPage"));
const AdminOrderDetailPage = lazy(() => import("@/pages/admin/AdminOrderDetailPage"));
const AdminUsersPage = lazy(() => import("@/pages/admin/AdminUsersPage"));
const AdminSettingsPage = lazy(() => import("@/pages/admin/AdminSettingsPage"));
const AdminVoucherPlatformsPage = lazy(() => import("@/pages/admin/AdminVoucherPlatformsPage"));
const AdminCategoriesPage = lazy(() => import("@/pages/admin/AdminCategoriesPage"));
const AdminVouchersPage = lazy(() => import("@/pages/admin/AdminVouchersPage"));
const AdminVoucherSalesPage = lazy(() => import("@/pages/admin/AdminVoucherSalesPage"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30_000 },
  },
});

function UserGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const ut = searchParams.get("ut");
  const isPlatformSso = Boolean(voucherPlatformSlugFromPath(location.pathname));

  if (ut && (isPlatformSso || !isAuthenticated)) {
    return <Navigate to={`/?${splashLoginSearch(ut, location.pathname, searchParams)}`} replace />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }
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

const isProduction = import.meta.env.PROD;

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AdminAuthProvider>
          <ToastProvider>
            <BrowserRouter>
              <Suspense fallback={<PageFallback />}>
                <Routes>
                  {/* Auth bootstrap for ?ut= wallet login; required by UserGuard */}
                  <Route path="/" element={<SplashPage />} />
                  <Route path="/reftek" element={<UserGuard><ReftekPage /></UserGuard>} />
                  <Route path="/reftek/category/:category" element={<UserGuard><ReftekCategoryPage /></UserGuard>} />
                  <Route path="/voucher" element={<Navigate to="/reftek" replace />} />
                  <Route path="/voucher/purchases" element={<Navigate to="/reftek" replace />} />
                  <Route path="/voucher/:slug/purchases" element={<UserGuard><VoucherPurchasesPage /></UserGuard>} />
                  <Route path="/voucher/:slug" element={<UserGuard><VoucherPlatformPage /></UserGuard>} />
                  <Route path="/payment/result" element={<UserGuard><PaymentResultPage /></UserGuard>} />
                  {!isProduction && (
                    <>
                      <Route path="/orders" element={<UserGuard><OrdersPage /></UserGuard>} />
                      <Route path="/orders/new" element={<UserGuard><CreateOrderPage /></UserGuard>} />
                      <Route path="/orders/:id" element={<UserGuard><OrderDetailPage /></UserGuard>} />
                      <Route path="/admin/login" element={<AdminLoginPage />} />
                      <Route path="/admin" element={<AdminGuard><AdminDashboardPage /></AdminGuard>} />
                      <Route path="/admin/orders" element={<AdminGuard><AdminOrdersPage /></AdminGuard>} />
                      <Route path="/admin/orders/:id" element={<AdminGuard><AdminOrderDetailPage /></AdminGuard>} />
                      <Route path="/admin/users" element={<AdminGuard><AdminUsersPage /></AdminGuard>} />
                      <Route path="/admin/settings" element={<AdminGuard><AdminSettingsPage /></AdminGuard>} />
                      <Route path="/admin/categories" element={<AdminGuard><AdminCategoriesPage /></AdminGuard>} />
                      <Route path="/admin/voucher-platforms" element={<AdminGuard><AdminVoucherPlatformsPage /></AdminGuard>} />
                      <Route path="/admin/vouchers" element={<AdminGuard><AdminVouchersPage /></AdminGuard>} />
                      <Route path="/admin/voucher-sales" element={<AdminGuard><AdminVoucherSalesPage /></AdminGuard>} />
                    </>
                  )}
                  <Route
                    path="*"
                    element={<Navigate to={isProduction ? "/reftek" : "/orders"} replace />}
                  />
                </Routes>
              </Suspense>
            </BrowserRouter>
          </ToastProvider>
        </AdminAuthProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
