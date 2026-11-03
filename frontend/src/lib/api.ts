import axios, { isAxiosError, type InternalAxiosRequestConfig } from "axios";
import { buildLoginHref } from "@/lib/utils";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  headers: { "Content-Type": "application/json" },
});

function errorMessage(error: unknown) {
  if (!isAxiosError(error)) return "خطای ارتباط با سرور";
  const data = error.response?.data as { message?: unknown } | string | undefined;
  if (data && typeof data === "object" && data.message) {
    return String(data.message);
  }
  if (typeof data === "string" && data.trim()) {
    const text = data.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (text) return text.slice(0, 200);
  }
  if (error.response?.status) {
    return `خطای سرور (${error.response.status})`;
  }
  return "خطای ارتباط با سرور";
}

function requestBearerToken(config: InternalAxiosRequestConfig | undefined): string | null {
  if (!config?.headers) return null;
  const raw = config.headers.Authorization ?? config.headers.authorization;
  const value = typeof raw === "string" ? raw : Array.isArray(raw) ? String(raw[0]) : null;
  if (!value?.startsWith("Bearer ")) return null;
  return value.slice("Bearer ".length);
}

/** True while Splash/UserGuard is exchanging a wallet `ut` — don't hard-redirect away. */
function isWalletBootstrapInProgress(): boolean {
  return new URLSearchParams(window.location.search).has("ut");
}

function redirectToUserLogin() {
  const { pathname, search } = window.location;
  if (pathname.startsWith("/admin") || pathname === "/login") return;
  window.location.href = buildLoginHref(pathname, new URLSearchParams(search));
}

api.interceptors.request.use((config) => {
  const userToken = localStorage.getItem("userToken");
  const adminToken = localStorage.getItem("adminToken");
  const token = config.url?.startsWith("/admin") ? adminToken : userToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (error.response?.status === 401) {
      const url = String(error.config?.url ?? "");
      const requestToken = requestBearerToken(error.config);

      if (url.startsWith("/admin")) {
        const currentAdminToken = localStorage.getItem("adminToken");
        if (currentAdminToken && requestToken !== currentAdminToken) {
          // Stale 401 after a newer admin login — ignore
        } else {
          localStorage.removeItem("adminToken");
          localStorage.removeItem("admin");
          if (window.location.pathname.startsWith("/admin") && window.location.pathname !== "/admin/login") {
            window.location.href = "/admin/login";
          }
        }
      } else if (!url.startsWith("/auth/otp") && !url.startsWith("/auth/wallet") && !url.startsWith("/auth/captcha")) {
        const currentUserToken = localStorage.getItem("userToken");
        if (currentUserToken && requestToken !== currentUserToken) {
          // Stale 401 after a newer wallet/OTP login — ignore
        } else {
          localStorage.removeItem("userToken");
          localStorage.removeItem("user");
          // Let Splash finish wallet exchange when `ut` is present
          if (!isWalletBootstrapInProgress()) {
            redirectToUserLogin();
          }
        }
      }
    }
    return Promise.reject(new Error(errorMessage(error)));
  },
);

export default api;
