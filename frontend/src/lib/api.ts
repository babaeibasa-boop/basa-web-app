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
    // Expired/invalid admin session: clear it and send the admin back to login.
    if (error.response?.status === 401 && error.config?.url?.startsWith("/admin")) {
      localStorage.removeItem("adminToken");
      localStorage.removeItem("admin");
      if (window.location.pathname.startsWith("/admin") && window.location.pathname !== "/admin/login") {
        window.location.href = "/admin/login";
      }
    }
    return Promise.reject(new Error(errorMessage(error)));
  },
);

export default api;
