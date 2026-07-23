import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  headers: { "Content-Type": "application/json" },
});

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
    const message = error.response?.data?.message || "خطای ارتباط با سرور";
    return Promise.reject(new Error(message));
  },
);

export default api;
