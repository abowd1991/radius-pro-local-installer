import { eq, desc, and, or, sql } from "drizzle-orm";
import { getDb } from "../db";
import { plans, InsertPlan, radiusCards } from "../../drizzle/schema";
import { TenantContext, buildTenantFilter } from "../tenant-isolation";
import { buildPlanNetworkReplyAttributes } from "../../shared/planNetworkAttributes";

// Get all plans (for super_admin)
export async function getAllPlans() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(plans).orderBy(desc(plans.createdAt));
}

// Get plans by owner (for clients/resellers)
export async function getPlansByOwner(ownerId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(plans).where(eq(plans.ownerId, ownerId)).orderBy(desc(plans.createdAt));
}

// Get plans with tenant isolation (supports sub-admins)
// Resellers and clients see plans from super_admin/owner + their own plans
export async function getPlansByTenant(tenantContext: TenantContext) {
  const db = await getDb();
  if (!db) return [];
  
  // Super admin and owner see all plans
  if (tenantContext.role === "owner" || tenantContext.role === "super_admin") {
    return db.select().from(plans).orderBy(desc(plans.createdAt));
  }
  
  // Resellers and clients see ONLY their own plans (not admin/owner plans)
  const effectiveOwnerId = tenantContext.role === "client_admin" || tenantContext.role === "client_staff"
    ? tenantContext.tenantId
    : tenantContext.userId;
  
  if (!effectiveOwnerId) return [];
  
  return db.select().from(plans)
    .where(sql`${plans.ownerId} = ${effectiveOwnerId}`)
    .orderBy(desc(plans.createdAt));
}

// Get active plans by owner
export async function getActivePlansByOwner(ownerId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(plans)
    .where(and(eq(plans.ownerId, ownerId), eq(plans.status, "active")))
    .orderBy(plans.price);
}

export async function getActivePlans() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(plans).where(eq(plans.status, "active")).orderBy(plans.price);
}

export async function getPlanById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(plans).where(eq(plans.id, id)).limit(1);
  return result[0] || null;
}

export async function createPlan(data: Omit<InsertPlan, "id" | "createdAt" | "updatedAt">) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(plans).values(data);
  return { success: true, id: result[0].insertId };
}

export async function updatePlan(id: number, data: Partial<InsertPlan>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(plans).set(data).where(eq(plans.id, id));
  return { success: true };
}

/**
 * يحفظ إعدادات حد البيانات وبولة MikroTik ويعيد بناء خصائص RADIUS للكروت
 * غير المنتهية ضمن Transaction واحدة. القيمة الفارغة تزيل السمة القديمة.
 */
export async function updatePlanAndSyncNetworkAttributes(id: number, data: Partial<InsertPlan>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.transaction(async (tx: any) => {
    const { id: _ignoredId, ...updateData } = data as any;
    await tx.update(plans).set(updateData).where(eq(plans.id, id));

    const [plan] = await tx
      .select({ dataLimit: plans.dataLimit, mikrotikAddressPool: plans.mikrotikAddressPool })
      .from(plans)
      .where(eq(plans.id, id))
      .limit(1);
    if (!plan) throw new Error("Plan not found after update");

    await tx.execute(sql`DELETE rr FROM radreply rr
      INNER JOIN radius_cards rc ON rc.username = rr.username
      WHERE rc.planId = ${id}
        AND rc.status != 'expired'
        AND rr.attribute IN ('Mikrotik-Total-Limit', 'Framed-Pool')`);

    const attributes = buildPlanNetworkReplyAttributes({
      dataLimitBytes: plan.dataLimit,
      mikrotikAddressPool: plan.mikrotikAddressPool,
    });
    for (const attribute of attributes) {
      await tx.execute(sql`INSERT INTO radreply (username, attribute, op, value)
        SELECT rc.username, ${attribute.attribute}, ${attribute.op}, ${attribute.value}
        FROM radius_cards rc
        WHERE rc.planId = ${id} AND rc.status != 'expired'`);
    }
  });

  return { success: true };
}

export async function deletePlan(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.delete(plans).where(eq(plans.id, id));
  return { success: true };
}
