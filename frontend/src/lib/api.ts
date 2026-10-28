import axios, { isAxiosError } from "axios";

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

function redirectToUserLogin() {
  const { pathname, search } = window.location;
  if (pathname.startsWith("/admin") || pathname === "/login") return;
  const redirect = pathname + search;
  const params = new URLSearchParams();
  params.set("redirect", redirect);
  window.location.href = `/login?${params.toString()}`;
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
      if (url.startsWith("/admin")) {
        localStorage.removeItem("adminToken");
        localStorage.removeItem("admin");
        if (window.location.pathname.startsWith("/admin") && window.location.pathname !== "/admin/login") {
          window.location.href = "/admin/login";
        }
      } else if (!url.startsWith("/auth/otp") && !url.startsWith("/auth/wallet") && !url.startsWith("/auth/captcha")) {
        localStorage.removeItem("userToken");
        localStorage.removeItem("user");
        redirectToUserLogin();
      }
    }
    return Promise.reject(new Error(errorMessage(error)));
  },
);

export default api;
