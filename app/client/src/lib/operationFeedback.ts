import { toast as sonnerToast } from "sonner";
import {
  resolveOperationFeedbackChannel,
  type OperationFeedbackKind,
} from "@shared/operationFeedbackPolicy";

type FeedbackOptions = {
  description?: string;
  duration?: number;
};

export type OperationFeedbackEvent = {
  id: string;
  kind: "success" | "error";
  message: string;
  description?: string;
};

type FeedbackListener = (event: OperationFeedbackEvent) => void;

const listeners = new Set<FeedbackListener>();
let sequence = 0;
let globalBridgeInstalled = false;

function createFeedbackId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  sequence += 1;
  return `feedback-${Date.now()}-${sequence}`;
}

function publish(event: OperationFeedbackEvent) {
  listeners.forEach((listener) => listener(event));
}

export function subscribeToOperationFeedback(listener: FeedbackListener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emitOperationResult(kind: "success" | "error", message: string, options?: FeedbackOptions) {
  const id = createFeedbackId();
  publish({
    id,
    kind,
    message,
    description: options?.description,
  });
  return id;
}

function messageToText(message: unknown) {
  if (typeof message === "string") return message;
  if (typeof message === "number") return String(message);
  return "";
}

function optionsToFeedbackOptions(options?: { description?: unknown }): FeedbackOptions | undefined {
  return typeof options?.description === "string" ? { description: options.description } : undefined;
}

/**
 * Every existing `toast` import from Sonner shares this singleton. Intercepting
 * it here upgrades current success/error calls without touching business logic.
 */
export function installGlobalOperationFeedbackBridge() {
  if (globalBridgeInstalled) return;
  globalBridgeInstalled = true;

  const mutableToast = sonnerToast as unknown as {
    success: (message: unknown, options?: { description?: unknown }) => string;
    error: (message: unknown, options?: { description?: unknown }) => string;
  };

  mutableToast.success = (message, options) => {
    return emitOperationResult("success", messageToText(message), optionsToFeedbackOptions(options));
  };
  mutableToast.error = (message, options) => {
    return emitOperationResult("error", messageToText(message), optionsToFeedbackOptions(options));
  };
}

function notify(kind: OperationFeedbackKind, message: string, options?: FeedbackOptions) {
  const channel = resolveOperationFeedbackChannel(kind);
  if (channel === "dialog" && (kind === "success" || kind === "error")) {
    emitOperationResult(kind, message, options);
    return undefined;
  }

  return sonnerToast[kind](message, options);
}

/**
 * Drop-in toast facade for feature pages that have completed the new feedback migration.
 * Warnings, information, and loading remain lightweight Sonner notifications.
 */
export const toast = {
  success: (message: string, options?: FeedbackOptions) => notify("success", message, options),
  error: (message: string, options?: FeedbackOptions) => notify("error", message, options),
  validation: (message: string, options?: FeedbackOptions) => notify("warning", message, options),
  warning: (message: string, options?: FeedbackOptions) => notify("warning", message, options),
  info: (message: string, options?: FeedbackOptions) => notify("info", message, options),
  loading: (message: string, options?: FeedbackOptions) => notify("loading", message, options),
  dismiss: sonnerToast.dismiss,
};
