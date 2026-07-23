import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import * as ToastPrimitive from "@radix-ui/react-toast";
import { cn } from "@/lib/utils";

interface ToastItem {
  id: string;
  title: string;
  variant?: "default" | "destructive";
}

const ToastContext = createContext<{
  toast: (title: string, variant?: "default" | "destructive") => void;
} | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const toast = useCallback((title: string, variant: "default" | "destructive" = "default") => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, title, variant }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      <ToastPrimitive.Provider>
        {children}
        {toasts.map((t) => (
          <ToastPrimitive.Root
            key={t.id}
            className={cn(
              "fixed bottom-4 left-4 z-50 rounded-lg px-4 py-3 shadow-lg text-sm font-medium",
              t.variant === "destructive"
                ? "bg-destructive text-destructive-foreground"
                : "bg-card text-card-foreground border",
            )}
            open
          >
            <ToastPrimitive.Title>{t.title}</ToastPrimitive.Title>
          </ToastPrimitive.Root>
        ))}
        <ToastPrimitive.Viewport />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within ToastProvider");
  return context;
}
