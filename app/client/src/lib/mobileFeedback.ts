export type MobileHapticCapabilities = {
  isError: boolean;
  isMobile: boolean;
  prefersReducedMotion: boolean;
  supportsVibration: boolean;
};

export function shouldUseErrorHaptic(capabilities: MobileHapticCapabilities) {
  return capabilities.isError
    && capabilities.isMobile
    && !capabilities.prefersReducedMotion
    && capabilities.supportsVibration;
}

export function triggerMobileErrorHaptic() {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;

  const isMobile = window.matchMedia?.("(max-width: 639px)").matches ?? false;
  const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  const supportsVibration = typeof navigator.vibrate === "function";

  if (!shouldUseErrorHaptic({
    isError: true,
    isMobile,
    prefersReducedMotion,
    supportsVibration,
  })) {
    return false;
  }

  navigator.vibrate([22, 32, 18]);
  return true;
}
