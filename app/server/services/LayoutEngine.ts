/**
 * LayoutEngine.ts — Single Source of Truth
 * 
 * All card layout calculations are done here.
 * Used by both PDF renderer and HTML renderer to ensure 100% WYSIWYG match.
 */

export interface TemplateLayout {
  username: {
    x: number;       // absolute pixels/points from left
    y: number;       // absolute pixels/points from top
    size: number;    // font size in pt
    align: "left" | "center" | "right";
    color: string;   // hex color
    fontFamily: string;
  };
  password: {
    x: number;
    y: number;
    size: number;
    align: "left" | "center" | "right";
    color: string;
    fontFamily: string;
  };
  qr: {
    x: number;       // center x
    y: number;       // center y
    size: number;    // width/height in same unit as cardWidth
    enabled: boolean;
    domain: string | null;
  };
}

export interface TemplateInput {
  usernameX: number;       // percentage 0-100
  usernameY: number;       // percentage 0-100
  usernameFontSize: number;
  usernameAlign: "left" | "center" | "right";
  usernameFontColor: string;
  usernameFontFamily: string;
  passwordX: number;
  passwordY: number;
  passwordFontSize: number;
  passwordAlign: "left" | "center" | "right";
  passwordFontColor: string;
  passwordFontFamily: string;
  qrCodeX: number;
  qrCodeY: number;
  qrCodeSize: number;
  qrCodeEnabled: boolean;
  qrCodeDomain: string | null;
}

/**
 * Font name mapping — always use real font names
 * DB may store aliases from old code, this normalizes them
 */
export const FONT_MAP: Record<string, string> = {
  normal: "Cairo",
  clear: "Tahoma",
  digital: "Courier New",
  cairo: "Cairo",
  arial: "Arial",
  tahoma: "Tahoma",
  "courier new": "Courier New",
  verdana: "Verdana",
  georgia: "Georgia",
  impact: "Impact",
};

export function normalizeFontFamily(fontFamily: string): string {
  if (!fontFamily) return "Cairo";
  const lower = fontFamily.toLowerCase();
  return FONT_MAP[lower] || fontFamily;
}

/**
 * Core layout calculation function.
 * 
 * @param template - Template settings with percentage-based positions
 * @param cardWidth - Card width in target unit (pt for PDF, mm for HTML)
 * @param cardHeight - Card height in target unit
 * @returns TemplateLayout with absolute positions in target unit
 */
export function getCardLayout(
  template: TemplateInput,
  cardWidth: number,
  cardHeight: number
): TemplateLayout {
  return {
    username: {
      x: (template.usernameX / 100) * cardWidth,
      y: (template.usernameY / 100) * cardHeight,
      size: Math.max(6, template.usernameFontSize),
      align: template.usernameAlign || "center",
      color: template.usernameFontColor || "#000000",
      fontFamily: normalizeFontFamily(template.usernameFontFamily),
    },
    password: {
      x: (template.passwordX / 100) * cardWidth,
      y: (template.passwordY / 100) * cardHeight,
      size: Math.max(6, template.passwordFontSize),
      align: template.passwordAlign || "center",
      color: template.passwordFontColor || "#000000",
      fontFamily: normalizeFontFamily(template.passwordFontFamily),
    },
    qr: {
      x: (template.qrCodeX / 100) * cardWidth,
      y: (template.qrCodeY / 100) * cardHeight,
      size: (template.qrCodeSize / 400) * cardWidth,
      enabled: template.qrCodeEnabled || false,
      domain: template.qrCodeDomain || null,
    },
  };
}

/**
 * Generate QR data string for a card
 */
export function getQrData(username: string, password: string, domain: string | null): string {
  if (domain) {
    return `${domain}?u=${username}&p=${password}`;
  }
  return `${username}:${password}`;
}
