import { createContext, useContext } from "react";

export type ToastAction = {
  label: string;
  onAction: () => void | Promise<void>;
};

export type Toast = {
  id: number;
  message: string;
  kind: "info" | "success" | "error";
  action?: ToastAction;
  /** Show a spinner on the action button after it was pressed. */
  busy?: boolean;
};

export type ToastContextValue = {
  showToast: (t: Omit<Toast, "id">, timeoutMs?: number) => number;
  dismissToast: (id: number) => void;
};

export const ToastContext = createContext<ToastContextValue | null>(null);

export function useToasts(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToasts must be used within ToastProvider");
  return ctx;
}
