import { getDb } from "../db";
import { cardTemplates, type CardTemplate, type InsertCardTemplate } from "../../drizzle/schema";
import { eq, and, isNull, desc } from "drizzle-orm";

// ============================================================================
// CARD TEMPLATES DATABASE OPERATIONS
// ============================================================================

/**
 * Get all templates for a reseller (including system templates)
 */
export async function getTemplates(resellerId?: number): Promise<CardTemplate[]> {
  const db = await getDb();
  if (!db) return [];
  
  if (resellerId) {
    return db
      .select()
      .from(cardTemplates)
      .where(eq(cardTemplates.resellerId, resellerId))
      .orderBy(desc(cardTemplates.isDefault), desc(cardTemplates.createdAt));
  }
  
  return db
    .select()
    .from(cardTemplates)
    .orderBy(desc(cardTemplates.isDefault), desc(cardTemplates.createdAt));
}

/**
 * Get a single template by ID
 */
export async function getTemplateById(id: number): Promise<CardTemplate | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  
  const [template] = await db
    .select()
    .from(cardTemplates)
    .where(eq(cardTemplates.id, id))
    .limit(1);
  return template;
}

/**
 * Get the default template for a reseller
 */
export async function getDefaultTemplate(resellerId?: number): Promise<CardTemplate | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  
  const conditions = resellerId
    ? and(eq(cardTemplates.resellerId, resellerId), eq(cardTemplates.isDefault, true))
    : eq(cardTemplates.isDefault, true);
  
  const [template] = await db
    .select()
    .from(cardTemplates)
    .where(conditions)
    .limit(1);
  
  return template;
}

/**
 * Create a new template
 */
export async function createTemplate(data: InsertCardTemplate): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const [result] = await db.insert(cardTemplates).values(data);
  return result.insertId;
}

/**
 * Create multiple templates at once (for multi-upload)
 */
export async function createTemplates(templates: InsertCardTemplate[]): Promise<number[]> {
  const ids: number[] = [];
  for (const template of templates) {
    const id = await createTemplate(template);
    ids.push(id);
  }
  return ids;
}

/**
 * Update a template
 */
export async function updateTemplate(
  id: number,
  data: Partial<InsertCardTemplate>
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db
    .update(cardTemplates)
    .set(data)
    .where(eq(cardTemplates.id, id));
}

/**
 * Set a template as default (and unset others for the same reseller)
 */
export async function setDefaultTemplate(id: number, resellerId?: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // First, unset all defaults for this reseller
  if (resellerId) {
    await db
      .update(cardTemplates)
      .set({ isDefault: false })
      .where(eq(cardTemplates.resellerId, resellerId));
  } else {
    await db
      .update(cardTemplates)
      .set({ isDefault: false })
      .where(isNull(cardTemplates.resellerId));
  }
  
  // Then set the new default
  await db
    .update(cardTemplates)
    .set({ isDefault: true })
    .where(eq(cardTemplates.id, id));
}

/**
 * Delete a template
 */
export async function deleteTemplate(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.delete(cardTemplates).where(eq(cardTemplates.id, id));
}

/**
 * Update text position settings for a template
 */
export async function updateTextPositions(
  id: number,
  positions: {
    usernameX?: number;
    usernameY?: number;
    passwordX?: number;
    passwordY?: number;
    qrCodeX?: number;
    qrCodeY?: number;
  }
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db
    .update(cardTemplates)
    .set(positions)
    .where(eq(cardTemplates.id, id));
}

/**
 * Update font settings for a template
 */
export async function updateFontSettings(
  id: number,
  settings: {
    usernameFontSize?: number;
    usernameFontFamily?: string; // Store actual font name: Arial, Tahoma, Cairo, etc.
    usernameFontColor?: string;
    usernameAlign?: "left" | "center" | "right";
    passwordFontSize?: number;
    passwordFontFamily?: string; // Store actual font name: Arial, Tahoma, Cairo, etc.
    passwordFontColor?: string;
    passwordAlign?: "left" | "center" | "right";
  }
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db
    .update(cardTemplates)
    .set(settings)
    .where(eq(cardTemplates.id, id));
}

/**
 * Update QR code settings for a template
 */
export async function updateQrCodeSettings(
  id: number,
  settings: {
    qrCodeEnabled?: boolean;
    qrCodeX?: number;
    qrCodeY?: number;
    qrCodeSize?: number;
    qrCodeDomain?: string;
  }
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db
    .update(cardTemplates)
    .set(settings)
    .where(eq(cardTemplates.id, id));
}

/**
 * Update print settings for a template
 */
export async function updatePrintSettings(
  id: number,
  settings: {
    cardsPerPage?: number;
    marginTop?: string;
    marginHorizontal?: string;
    columnsPerPage?: number;
  }
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db
    .update(cardTemplates)
    .set(settings)
    .where(eq(cardTemplates.id, id));
}
