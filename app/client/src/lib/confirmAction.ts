export type ConfirmActionOptions = {
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "destructive" | "primary";
};

type ConfirmationListener = (options: ConfirmActionOptions) => Promise<boolean>;

let confirmationListener: ConfirmationListener | null = null;

declare global {
  interface Window {
    confirmOperation: (description: string, title?: string, tone?: "destructive" | "primary") => Promise<boolean>;
  }
}

export function registerConfirmationListener(listener: ConfirmationListener | null) {
  confirmationListener = listener;
}

/**
 * Promise-based replacement for native confirm(). The native fallback only protects
 * callers during the first render before the provider mounts.
 */
export function confirmAction(options: ConfirmActionOptions): Promise<boolean> {
  if (confirmationListener) return confirmationListener(options);
  return Promise.resolve(window.confirm(`${options.title}\n\n${options.description}`));
}

if (typeof window !== "undefined") {
  window.confirmOperation = (description, title, tone = "destructive") => confirmAction({
    title: title || "تأكيد العملية",
    description,
    confirmLabel: "تأكيد",
    tone,
  });
}
