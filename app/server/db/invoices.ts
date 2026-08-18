import { eq, desc, and } from "drizzle-orm";
import { getDb } from "../db";
import { invoices, users, InsertInvoice } from "../../drizzle/schema";
import { TenantContext, buildTenantFilter, canSeeAllData, getEffectiveOwnerId } from "../tenant-isolation";
import { nanoid } from "nanoid";

function generateInvoiceNumber(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const random = nanoid(6).toUpperCase();
  return `INV-${year}${month}-${random}`;
}

export async function getAllInvoices(options?: { status?: string; page?: number; limit?: number }) {
  const db = await getDb();
  if (!db) return [];
  const query = db.select({
    id: invoices.id,
    invoiceNumber: invoices.invoiceNumber,
    userId: invoices.userId,
    resellerId: invoices.resellerId,
    type: invoices.type,
    subtotal: invoices.subtotal,
    tax: invoices.tax,
    discount: invoices.discount,
    total: invoices.total,
    currency: invoices.currency,
    status: invoices.status,
    dueDate: invoices.dueDate,
    paidAt: invoices.paidAt,
    paymentMethod: invoices.paymentMethod,
    paymentReference: invoices.paymentReference,
    notes: invoices.notes,
    items: invoices.items,
    pdfUrl: invoices.pdfUrl,
    createdAt: invoices.createdAt,
    updatedAt: invoices.updatedAt,
    userName: users.name,
    userEmail: users.email,
  })
    .from(invoices)
    .leftJoin(users, eq(invoices.userId, users.id))
    .orderBy(desc(invoices.createdAt))
    .limit(options?.limit || 50);
  if (options?.status) {
    return query.where(eq(invoices.status, options.status as any));
  }
  return query;
}

export async function getInvoicesByUserId(userId: number, options?: { status?: string; page?: number; limit?: number }) {
  const db = await getDb();
  if (!db) return [];
  let conditions: any[] = [eq(invoices.userId, userId)];
  if (options?.status) {
    conditions.push(eq(invoices.status, options.status as any));
  }
  return db.select({
    id: invoices.id,
    invoiceNumber: invoices.invoiceNumber,
    userId: invoices.userId,
    resellerId: invoices.resellerId,
    type: invoices.type,
    subtotal: invoices.subtotal,
    tax: invoices.tax,
    discount: invoices.discount,
    total: invoices.total,
    currency: invoices.currency,
    status: invoices.status,
    dueDate: invoices.dueDate,
    paidAt: invoices.paidAt,
    paymentMethod: invoices.paymentMethod,
    paymentReference: invoices.paymentReference,
    notes: invoices.notes,
    items: invoices.items,
    pdfUrl: invoices.pdfUrl,
    createdAt: invoices.createdAt,
    updatedAt: invoices.updatedAt,
    userName: users.name,
    userEmail: users.email,
  })
    .from(invoices)
    .leftJoin(users, eq(invoices.userId, users.id))
    .where(and(...conditions))
    .orderBy(desc(invoices.createdAt))
    .limit(options?.limit || 50);
}

// Get invoices with tenant isolation (supports sub-admins)
export async function getInvoicesByTenant(tenantContext: TenantContext, options?: { status?: string; page?: number; limit?: number }) {
  const db = await getDb();
  if (!db) return [];
  
  // Owner/super_admin see all
  if (canSeeAllData(tenantContext)) {
    return getAllInvoices(options);
  }
  
  // Others see only their invoices
  const effectiveUserId = getEffectiveOwnerId(tenantContext);
  return getInvoicesByUserId(effectiveUserId, options);
}

export async function getInvoiceById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(invoices).where(eq(invoices.id, id)).limit(1);
  return result[0] || null;
}

export async function getInvoiceByNumber(invoiceNumber: string) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(invoices).where(eq(invoices.invoiceNumber, invoiceNumber)).limit(1);
  return result[0] || null;
}

export async function createInvoice(data: {
  userId: number;
  resellerId?: number;
  type: "subscription" | "card_purchase" | "deposit" | "other";
  items: Array<{ description: string; quantity: number; unitPrice: string }>;
  notes?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Calculate totals
  let subtotal = 0;
  for (const item of data.items) {
    subtotal += item.quantity * parseFloat(item.unitPrice);
  }
  
  const tax = 0; // Can be configured
  const discount = 0;
  const total = subtotal + tax - discount;
  
  const invoiceNumber = generateInvoiceNumber();
  const dueDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days from now
  
  const result = await db.insert(invoices).values({
    invoiceNumber,
    userId: data.userId,
    resellerId: data.resellerId,
    type: data.type,
    subtotal: subtotal.toFixed(2),
    tax: tax.toFixed(2),
    discount: discount.toFixed(2),
    total: total.toFixed(2),
    status: "pending",
    dueDate,
    items: data.items,
    notes: data.notes,
  });
  
  return { success: true, id: result[0].insertId, invoiceNumber };
}

export async function updateInvoicePdfUrl(id: number, pdfUrl: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(invoices).set({ pdfUrl }).where(eq(invoices.id, id));
  return { success: true };
}

export async function updateInvoiceStatus(id: number, status: "draft" | "pending" | "paid" | "cancelled" | "refunded") {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const updateData: any = { status };
  
  if (status === "paid") {
    updateData.paidAt = new Date();
  }
  
  await db.update(invoices).set(updateData).where(eq(invoices.id, id));
  return { success: true };
}

export async function markAsPaid(id: number, paymentMethod: string, paymentReference: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(invoices)
    .set({
      status: "paid",
      paidAt: new Date(),
      paymentMethod,
      paymentReference,
    })
    .where(eq(invoices.id, id));
  
  return { success: true };
}

export async function getPendingInvoicesCount(userId?: number) {
  const db = await getDb();
  if (!db) return 0;
  
  let query = db.select().from(invoices).where(eq(invoices.status, "pending"));
  
  if (userId) {
    query = db.select().from(invoices).where(and(eq(invoices.status, "pending"), eq(invoices.userId, userId)));
  }
  
  const result = await query;
  return result.length;
}
