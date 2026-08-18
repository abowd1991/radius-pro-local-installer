export type OperationFeedbackKind = "success" | "error" | "warning" | "info" | "loading";

export type OperationFeedbackChannel = "dialog" | "toast";

/**
 * Keeps consequential operation results visually distinct from lightweight guidance.
 * The policy is UI-only and intentionally has no dependency on API, RADIUS, or sessions.
 */
export function resolveOperationFeedbackChannel(kind: OperationFeedbackKind): OperationFeedbackChannel {
  return kind === "success" || kind === "error" ? "dialog" : "toast";
}
