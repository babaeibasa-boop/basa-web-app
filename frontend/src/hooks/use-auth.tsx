import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { authApi } from "@/api";
import type { User } from "@/types";

interface AuthContextType {
  user: User | null;
  token: string | null;
  profileReady: boolean;
  login: (token: string, user: User) => void;
  updateUser: (user: User) => void;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

function storedUser(): User | null {
  const raw = localStorage.getItem("user");
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as User;
    if (!parsed || typeof parsed !== "object") return null;
    return { ...parsed, isDeveloper: undefined };
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(storedUser);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("userToken"));
  const [profileReady, setProfileReady] = useState(() => !localStorage.getItem("userToken"));

  const login = useCallback((newToken: string, newUser: User) => {
    localStorage.setItem("userToken", newToken);
    localStorage.setItem("user", JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
  }, []);

  const updateUser = useCallback((newUser: User) => {
    localStorage.setItem("user", JSON.stringify(newUser));
    setUser(newUser);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("userToken");
    localStorage.removeItem("user");
    setToken(null);
    setUser(null);
    setProfileReady(true);
  }, []);

  useEffect(() => {
    if (!token) {
      setProfileReady(true);
      return;
    }

    let cancelled = false;
    authApi
      .getProfile()
      .then((res) => {
        if (!cancelled && res.data) updateUser(res.data);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setProfileReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, [token, updateUser]);

  return (
    <AuthContext.Provider
      value={{ user, token, profileReady, login, updateUser, logout, isAuthenticated: !!token }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}

interface AdminAuthContextType {
  admin: { id: string; username: string; fullName: string } | null;
  token: string | null;
  login: (token: string, admin: { id: string; username: string; fullName: string }) => void;
  logout: () => void;
  isAuthenticated: boolean;
}

const AdminAuthContext = createContext<AdminAuthContextType | null>(null);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [admin, setAdmin] = useState<AdminAuthContextType["admin"]>(() => {
    const stored = localStorage.getItem("admin");
    return stored ? JSON.parse(stored) : null;
  });
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("adminToken"));

  const login = useCallback(
    (newToken: string, newAdmin: { id: string; username: string; fullName: string }) => {
      localStorage.setItem("adminToken", newToken);
      localStorage.setItem("admin", JSON.stringify(newAdmin));
      setToken(newToken);
      setAdmin(newAdmin);
    },
    [],
  );

  const logout = useCallback(() => {
    localStorage.removeItem("adminToken");
    localStorage.removeItem("admin");
    setToken(null);
    setAdmin(null);
  }, []);

  return (
    <AdminAuthContext.Provider value={{ admin, token, login, logout, isAuthenticated: !!token }}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  const context = useContext(AdminAuthContext);
  if (!context) throw new Error("useAdminAuth must be used within AdminAuthProvider");
  return context;
}

export function useTheme() {
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    const stored = localStorage.getItem("theme");
    if (stored === "dark" || stored === "light") return stored;
    return "light";
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("theme", theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  }, []);

  return { theme, toggleTheme };
}
