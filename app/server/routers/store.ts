/**
 * Card Store Router
 * متجر بطاقات الإنترنت — endpoints عامة للزبائن + محمية للعملاء
 *
 * نظام الحجز الذري:
 * - createOrder: يحجز كرتاً ذرياً (status='reserved', reservedOrderId=orderId) عند إنشاء الطلب
 * - deliverOrder: يؤكد الكرت المحجوز لهذا الطلب تحديداً
 * - cancelOrder: يُحرر الكرت المحجوز (status='unused', reservedOrderId=null, reservedAt=null)
 * - الحجز دائم: لا انتهاء تلقائي — يبقى محجوزاً حتى التسليم أو الإلغاء اليدوي
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, protectedProcedure, superAdminProcedure } from "../_core/trpc.js";
import { getDb } from "../db.js";
import {
  stores,
  storeProducts,
  storeOrders,
  storePhonePins,
  radiusCards,
  notificationChannels,
  notificationPreferences,
  users,
} from "../../drizzle/schema.js";
import { eq, and, desc, count, sql, isNull } from "drizzle-orm";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { storagePut } from "../storage.js";
import * as tweetsmsService from "../services/tweetsmsService.js";
import { getTenantContext, getEffectiveOwnerId } from "../tenant-isolation.js";
import { isAdmin as isAdminFn } from "../_core/roles";

/** توليد token فريد لتتبع الطلب */
function generateOrderToken(): string {
  return randomBytes(24).toString('hex');
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * بناء رسالة SMS لطلب متجر البطاقات
 * يدعم القالب المخصص بالمتغيرات: {name}, {cards}, {count}
 * القالب الافتراضي: اسم المستخدم وكلمة المرور فقط بدون رابط
 */
function buildStoreOrderSms(
  customerName: string,
  cards: Array<{ username: string; password: string | null }>,
  customTemplate?: string | null
): string {
  const cardLines = cards.map((c, i) =>
    cards.length === 1
      ? `${c.username} / ${c.password ?? '—'}`
      : `${i + 1}: ${c.username} / ${c.password ?? '—'}`
  ).join('\n');

  if (customTemplate) {
    return customTemplate
      .replace(/\{name\}/g, customerName)
      .replace(/\{cards\}/g, cardLines)
      .replace(/\{count\}/g, String(cards.length));
  }

  // القالب الافتراضي — بدون رابط
  const header = cards.length === 1
    ? `مرحباً ${customerName}،بطاقة الإنترنت:`
    : `مرحباً ${customerName}، ${cards.length} بطاقات:`;
  return `${header}\n${cardLines}\nشكراً`;
}

/** جلب عدد الكروت المتاحة (unused) في دفعة معينة */
async function getAvailableStockCount(batchId: string | null | undefined, ownerId: number): Promise<number> {
  if (!batchId) return 0;
  const db = await getDb();
  const [row] = await db
    .select({ cnt: count() })
    .from(radiusCards)
    .where(
      and(
        eq(radiusCards.batchId, batchId),
        eq(radiusCards.status, "unused"),
        eq(radiusCards.createdBy, ownerId)
      )
    );
  return Number(row?.cnt ?? 0);
}

/**
 * حجز كرت ذري — يستخدم UPDATE ذري لمنع Race Condition
 * يُحدِّث أول كرت unused في الدفعة ويضع status='reserved' + reservedOrderId
 * يعيد الكرت المحجوز أو null إذا لا يوجد مخزون
 */
async function atomicReserveCard(
  batchId: string,
  ownerId: number,
  orderId: number
): Promise<typeof radiusCards.$inferSelect | null> {
  const db = await getDb();

  // خطوة 1: ابحث عن أول كرت unused في الدفعة
  const [candidate] = await db
    .select({ id: radiusCards.id })
    .from(radiusCards)
    .where(
      and(
        eq(radiusCards.batchId, batchId),
        eq(radiusCards.status, "unused"),
        eq(radiusCards.createdBy, ownerId)
      )
    )
    .limit(1);

  if (!candidate) return null;

  // خطوة 2: UPDATE ذري — يشترط أن الكرت لا يزال unused
  // هذا يمنع Race Condition: إذا حجزه طلب آخر في نفس اللحظة، الـ UPDATE لن يؤثر
  const [updateResult] = await db
    .update(radiusCards)
    .set({
      status: "reserved",
      reservedOrderId: orderId,
      reservedAt: new Date(),
    })
    .where(
      and(
        eq(radiusCards.id, candidate.id),
        eq(radiusCards.status, "unused") // شرط ذري: يجب أن لا يزال unused
      )
    );

  const affectedRows = (updateResult as any).affectedRows ?? 0;

  // إذا لم يتأثر أي صف → كرت آخر سبقنا وحجزه
  if (affectedRows === 0) {
    // حاول مرة أخرى مع كرت مختلف (recursive retry)
    return atomicReserveCard(batchId, ownerId, orderId);
  }

  // جلب الكرت المحجوز
  const [card] = await db
    .select()
    .from(radiusCards)
    .where(eq(radiusCards.id, candidate.id))
    .limit(1);

  return card ?? null;
}

/** التحقق من ملكية المتجر */
async function assertStoreOwnership(storeId: number, userId: number, role: string) {
  const db = await getDb();
  const [store] = await db.select().from(stores).where(eq(stores.id, storeId)).limit(1);
  if (!store) throw new TRPCError({ code: "NOT_FOUND", message: "المتجر غير موجود" });
  const isAdmin = isAdminFn(role);
  if (!isAdmin && store.ownerId !== userId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "ليس لديك صلاحية للوصول إلى هذا المتجر" });
  }
  return store;
}

// ─── Router ─────────────────────────────────────────────────────────────────

export const storeRouter = router({

  // =========================================================================
  // PUBLIC ENDPOINTS — لا تحتاج تسجيل دخول
  // =========================================================================

  /** جلب بيانات المتجر بالـ slug */
  getStore: publicProcedure
    .input(z.object({ slug: z.string().min(1) }))
    .query(async ({ input }) => {
      const db = await getDb();
      const [store] = await db
        .select()
        .from(stores)
        .where(and(eq(stores.slug, input.slug), eq(stores.active, true)))
        .limit(1);
      if (!store) throw new TRPCError({ code: "NOT_FOUND", message: "المتجر غير موجود أو غير نشط" });
      return store;
    }),

  /** جلب منتجات المتجر مع عدد المخزون المتاح */
  getProducts: publicProcedure
    .input(z.object({ storeId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const products = await db
        .select()
        .from(storeProducts)
        .where(and(eq(storeProducts.storeId, input.storeId), eq(storeProducts.active, true)))
        .orderBy(storeProducts.sortOrder, storeProducts.id);

      // جلب عدد المخزون لكل منتج
      const [storeRow] = await db.select({ ownerId: stores.ownerId }).from(stores).where(eq(stores.id, input.storeId)).limit(1);
      const ownerId = storeRow?.ownerId ?? 0;

      const productsWithStock = await Promise.all(
        products.map(async (p: (typeof products)[number]) => ({
          ...p,
          availableStock: await getAvailableStockCount(p.batchId, ownerId),
        }))
      );
      return productsWithStock;
    }),

  /**
   * إنشاء طلب جديد مع حجز كرت ذري
   *
   * الحجز الذري يمنع Race Condition:
   * - يُحجز الكرت فور إنشاء الطلب (status='reserved')
   * - لا يمكن لطلبين مختلفين الحصول على نفس الكرت
   * - الحجز دائم حتى التسليم أو الإلغاء
   */
  createOrder: publicProcedure
    .input(
      z.object({
        storeId: z.number(),
        productId: z.number(),
        customerName: z.string().min(2, "الاسم مطلوب"),
        customerPhone: z.string().min(7, "رقم الجوال مطلوب"),
        quantity: z.number().int().min(1).max(20).default(1),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();

      // التحقق من وجود المتجر والمنتج
      const [store] = await db.select().from(stores).where(and(eq(stores.id, input.storeId), eq(stores.active, true))).limit(1);
      if (!store) throw new TRPCError({ code: "NOT_FOUND", message: "المتجر غير موجود" });

      const [product] = await db.select().from(storeProducts).where(and(
        eq(storeProducts.id, input.productId),
        eq(storeProducts.storeId, input.storeId),
        eq(storeProducts.active, true)
      )).limit(1);
      if (!product) throw new TRPCError({ code: "NOT_FOUND", message: "المنتج غير موجود" });

      const qty = input.quantity ?? 1;

      // التحقق من المخزون قبل إنشاء الطلب
      if (product.batchId) {
        const stock = await getAvailableStockCount(product.batchId, store.ownerId);
        if (stock < qty) throw new TRPCError({ code: "BAD_REQUEST", message: stock === 0 ? "نفد المخزون لهذه الباقة" : `المخزون المتاح ${stock} كروت فقط` });
      }

      // توليد token فريد لتتبع الطلب
      const orderToken = generateOrderToken();

      // إنشاء الطلب أولاً للحصول على orderId
      const totalAmount = (parseFloat(product.price as string) * qty).toFixed(2);
      const [result] = await db.insert(storeOrders).values({
        storeId: input.storeId,
        productId: input.productId,
        orderToken,
        customerName: input.customerName,
        customerPhone: input.customerPhone,
        amount: totalAmount,
        quantity: qty,
        status: "pending",
        notes: input.notes ?? null,
      });

      const orderId = (result as any).insertId as number;

      // الحجز الذري: حجز qty كروت لهذا الطلب
      if (product.batchId) {
        const reservedCards: { id: number }[] = [];
        for (let i = 0; i < qty; i++) {
          const reservedCard = await atomicReserveCard(product.batchId, store.ownerId, orderId);
          if (!reservedCard) {
            // نفد المخزون أثناء الحجز — ألغِ الطلب
            await db.update(storeOrders).set({ status: "cancelled", notes: `نفد المخزون أثناء معالجة الطلب (تم حجز ${i} من ${qty})` }).where(eq(storeOrders.id, orderId));
            throw new TRPCError({ code: "BAD_REQUEST", message: `نفد المخزون، يرجى المحاولة مرة أخرى` });
          }
          reservedCards.push({ id: reservedCard.id });
        }
        // ربط الكروت المحجوزة بالطلب
        await db.update(storeOrders).set({
          cardId: reservedCards[0].id,
          cardIds: JSON.stringify(reservedCards.map(c => c.id)),
        }).where(eq(storeOrders.id, orderId));
      }

      // ─── إشعار Telegram للمالك ────────────────────────────────────────────────
      try {
        const [tgChannel] = await db
          .select({ botToken: notificationChannels.telegramBotToken, chatId: notificationChannels.telegramChatId })
          .from(notificationChannels)
          .where(
            and(
              eq(notificationChannels.ownerId, store.ownerId),
              eq(notificationChannels.channel, 'telegram')
            )
          )
          .limit(1);
        if (tgChannel?.botToken && tgChannel?.chatId) {
          const msgText =
            `🛒 <b>طلب جديد #${orderId}</b>\n` +
            `📦 <b>المنتج:</b> ${product.name}\n` +
            `🔢 <b>الكمية:</b> ${qty} كرت\n` +
            `👤 <b>الزبون:</b> ${input.customerName}\n` +
            `📱 <b>الجوال:</b> <code>${input.customerPhone}</code>\n` +
            `💰 <b>المبلغ:</b> ${totalAmount}\n` +
            (input.notes ? `📝 <b>ملاحظات:</b> ${input.notes}\n` : '');
          await fetch(`https://api.telegram.org/bot${tgChannel.botToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: tgChannel.chatId,
              text: msgText,
              parse_mode: 'HTML',
              reply_markup: {
                inline_keyboard: [[
                  { text: '✅ قبول الطلب وتسليم الكرت', callback_data: `accept_order:${orderId}:${input.storeId}` }
                ]]
              }
            })
          });
        }
      } catch (tgErr) {
        // لا نوقف الطلب بسبب فشل الإشعار
        console.error('[Store] Telegram notify error:', tgErr);
      }

      return { orderId, orderToken, amount: product.price };
    }),

  /** رفع إيصال الدفع */
  uploadReceipt: publicProcedure
    .input(
      z.object({
        orderId: z.number(),
        receiptBase64: z.string(),
        mimeType: z.string().default("image/jpeg"),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [order] = await db.select().from(storeOrders).where(eq(storeOrders.id, input.orderId)).limit(1);
      if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "الطلب غير موجود" });
      if (order.status !== "pending") throw new TRPCError({ code: "BAD_REQUEST", message: "لا يمكن رفع إيصال لطلب غير معلق" });

      // رفع الصورة إلى S3
      const buffer = Buffer.from(input.receiptBase64, "base64");
      const ext = input.mimeType.split("/")[1] ?? "jpg";
      const key = `store-receipts/${order.storeId}/${order.id}-${Date.now()}.${ext}`;
      const { url } = await storagePut(key, buffer, input.mimeType);

      await db.update(storeOrders).set({ receiptUrl: url }).where(eq(storeOrders.id, input.orderId));

      // ─── إرسال صورة الإيصال لـ Telegram ─────────────────────────────────────
      try {
        // جلب ownerId من المتجر
        const [storeRow] = await db.select({ ownerId: stores.ownerId }).from(stores).where(eq(stores.id, order.storeId)).limit(1);
        const storeOwnerId = storeRow?.ownerId;
        if (storeOwnerId) {
          const [tgChannel] = await db
            .select({ botToken: notificationChannels.telegramBotToken, chatId: notificationChannels.telegramChatId })
            .from(notificationChannels)
            .where(and(
              eq(notificationChannels.ownerId, storeOwnerId),
              eq(notificationChannels.channel, 'telegram')
            ))
            .limit(1);
          if (tgChannel?.botToken && tgChannel?.chatId) {
            // إرسال صورة الإيصال مع caption وزر قبول
            await fetch(`https://api.telegram.org/bot${tgChannel.botToken}/sendPhoto`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: tgChannel.chatId,
                photo: url,
                caption:
                  `🖼️ <b>إيصال الدفع — طلب #${input.orderId}</b>\n` +
                  `👤 <b>الزبون:</b> ${order.customerName}\n` +
                  `📱 <b>الجوال:</b> <code>${order.customerPhone}</code>\n` +
                  `💰 <b>المبلغ:</b> ${order.amount}`,
                parse_mode: 'HTML',
                reply_markup: {
                  inline_keyboard: [[
                    { text: '✅ قبول الطلب وتسليم الكرت', callback_data: `accept_order:${input.orderId}:${order.storeId}` }
                  ]]
                }
              })
            });
          }
        }
      } catch (tgErr) {
        console.error('[Store] Telegram receipt photo error:', tgErr);
      }

      return { receiptUrl: url };
    }),

  // =========================================================================
  // PROTECTED — العميل يدير متجره
  // =========================================================================

  /** إعداد المتجر (إنشاء أو تحديث) */
  setupStore: protectedProcedure
    .input(
      z.object({
        slug: z.string().min(3).max(80).regex(/^[a-z0-9-]+$/, "الـ slug يجب أن يحتوي على حروف إنجليزية صغيرة وأرقام وشرطة فقط"),
        name: z.string().min(2).max(120),
        description: z.string().optional(),
        paymentPhone: z.string().optional(),
        paymentInstructions: z.string().optional(),
        whatsappPhone: z.string().optional(),
        primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
        secondaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
        bgStyle: z.enum(["dark", "light", "gradient", "custom"]).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      const ownerId = getEffectiveOwnerId(getTenantContext(ctx.user));

      // التحقق من عدم تكرار الـ slug
      const [existing] = await db.select({ id: stores.id, ownerId: stores.ownerId }).from(stores).where(eq(stores.slug, input.slug)).limit(1);
      if (existing && existing.ownerId !== ownerId) {
        throw new TRPCError({ code: "CONFLICT", message: "هذا الرابط مستخدم من قِبل متجر آخر، الرجاء اختيار رابط مختلف" });
      }

      // إنشاء أو تحديث
      const [myStore] = await db.select().from(stores).where(eq(stores.ownerId, ownerId)).limit(1);
      if (myStore) {
        await db.update(stores).set({ ...input }).where(eq(stores.ownerId, ownerId));
        return { storeId: myStore.id, slug: input.slug };
      } else {
        const [res] = await db.insert(stores).values({ ownerId, ...input });
        return { storeId: (res as any).insertId as number, slug: input.slug };
      }
    }),

  /** جلب بيانات متجر العميل الحالي */
  getMyStore: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    const ownerId = getEffectiveOwnerId(getTenantContext(ctx.user));
    const [store] = await db.select().from(stores).where(eq(stores.ownerId, ownerId)).limit(1);
    return store ?? null;
  }),

  /** تحديث شعار المتجر */
  updateStoreLogo: protectedProcedure
    .input(z.object({ logoBase64: z.string(), mimeType: z.string().default("image/png") }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      const ownerId = getEffectiveOwnerId(getTenantContext(ctx.user));
      const [store] = await db.select().from(stores).where(eq(stores.ownerId, ownerId)).limit(1);
      if (!store) throw new TRPCError({ code: "NOT_FOUND", message: "لا يوجد متجر، قم بإنشاء متجر أولاً" });

      const buffer = Buffer.from(input.logoBase64, "base64");
      const ext = input.mimeType.split('/')[1] || 'png';
      const fileKey = `store-logos/logo-${ownerId}-${Date.now()}.${ext}`;
      const { url } = await storagePut(fileKey, buffer, input.mimeType);
      await db.update(stores).set({ logoUrl: url }).where(eq(stores.id, store.id));
      return { logoUrl: url };
    }),

  /** تفعيل/تعطيل المتجر */
  toggleStore: protectedProcedure
    .input(z.object({ active: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      const ownerId = getEffectiveOwnerId(getTenantContext(ctx.user));
      await db.update(stores).set({ active: input.active }).where(eq(stores.ownerId, ownerId));
      return { success: true };
    }),

  // ─── Products ─────────────────────────────────────────────────────────────

  /** إضافة منتج جديد */
  addProduct: protectedProcedure
    .input(
      z.object({
        storeId: z.number(),
        name: z.string().min(2).max(120),
        description: z.string().optional(),
        price: z.string().regex(/^\d+(\.\d{1,2})?$/, "السعر يجب أن يكون رقماً"),
        planId: z.number().optional(),
        batchId: z.string().optional(),
        stockThreshold: z.number().min(1).default(5),
        sortOrder: z.number().default(0),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertStoreOwnership(input.storeId, ctx.user.id, ctx.user.role);
      const db = await getDb();
      const [res] = await db.insert(storeProducts).values({
        storeId: input.storeId,
        name: input.name,
        description: input.description ?? null,
        price: input.price,
        planId: input.planId ?? null,
        batchId: input.batchId ?? null,
        stockThreshold: input.stockThreshold,
        sortOrder: input.sortOrder,
      });
      return { productId: (res as any).insertId as number };
    }),

  /** تحديث منتج */
  updateProduct: protectedProcedure
    .input(
      z.object({
        productId: z.number(),
        storeId: z.number(),
        name: z.string().min(2).max(120).optional(),
        description: z.string().optional(),
        price: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
        planId: z.number().optional().nullable(),
        batchId: z.string().optional().nullable(),
        stockThreshold: z.number().min(1).optional(),
        active: z.boolean().optional(),
        sortOrder: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertStoreOwnership(input.storeId, ctx.user.id, ctx.user.role);
      const db = await getDb();
      const { productId, storeId, ...updates } = input;
      await db.update(storeProducts).set(updates as any).where(and(eq(storeProducts.id, productId), eq(storeProducts.storeId, storeId)));
      return { success: true };
    }),

  /** حذف منتج */
  deleteProduct: protectedProcedure
    .input(z.object({ productId: z.number(), storeId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await assertStoreOwnership(input.storeId, ctx.user.id, ctx.user.role);
      const db = await getDb();
      await db.delete(storeProducts).where(and(eq(storeProducts.id, input.productId), eq(storeProducts.storeId, input.storeId)));
      return { success: true };
    }),

  /** جلب منتجات المتجر مع المخزون (للوحة التحكم) */
  getMyProducts: protectedProcedure
    .input(z.object({ storeId: z.number() }))
    .query(async ({ ctx, input }) => {
      const store = await assertStoreOwnership(input.storeId, ctx.user.id, ctx.user.role);
      const db = await getDb();
      const products = await db
        .select()
        .from(storeProducts)
        .where(eq(storeProducts.storeId, input.storeId))
        .orderBy(storeProducts.sortOrder, storeProducts.id);

      const productsWithStock = await Promise.all(
        products.map(async (p: (typeof products)[number]) => ({
          ...p,
          availableStock: await getAvailableStockCount(p.batchId, store.ownerId),
        }))
      );
      return productsWithStock;
    }),

  // ─── Orders ───────────────────────────────────────────────────────────────

  /** جلب طلبات المتجر */
  getOrders: protectedProcedure
    .input(
      z.object({
        storeId: z.number(),
        status: z.enum(["pending", "confirmed", "delivered", "cancelled", "all"]).default("all"),
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(100).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      await assertStoreOwnership(input.storeId, ctx.user.id, ctx.user.role);
      const db = await getDb();

      const conditions = [eq(storeOrders.storeId, input.storeId)];
      if (input.status !== "all") {
        conditions.push(eq(storeOrders.status, input.status as any));
      }

      const offset = (input.page - 1) * input.limit;
      const [orders, [{ total }]] = await Promise.all([
        db.select().from(storeOrders).where(and(...conditions)).orderBy(desc(storeOrders.createdAt)).limit(input.limit).offset(offset),
        db.select({ total: count() }).from(storeOrders).where(and(...conditions)),
      ]);

      return { orders, total: Number(total), page: input.page, limit: input.limit };
    }),

  /** تأكيد طلب (confirmed) */
  confirmOrder: protectedProcedure
    .input(z.object({ orderId: z.number(), storeId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await assertStoreOwnership(input.storeId, ctx.user.id, ctx.user.role);
      const db = await getDb();
      await db.update(storeOrders)
        .set({ status: "confirmed", updatedAt: new Date() })
        .where(and(eq(storeOrders.id, input.orderId), eq(storeOrders.storeId, input.storeId), eq(storeOrders.status, "pending")));
      return { success: true };
    }),

  /**
   * تسليم الكرت للزبون
   *
   * يستخدم الكرت المحجوز مسبقاً (reservedOrderId = orderId)
   * إذا لم يكن محجوزاً (طلب قديم)، يسحب كرتاً متاحاً
   */
  deliverOrder: protectedProcedure
    .input(
      z.object({
        orderId: z.number(),
        storeId: z.number(),
        cardId: z.number().optional(),   // إذا اختار يدوياً
      })
    )
    .mutation(async ({ ctx, input }) => {
      const store = await assertStoreOwnership(input.storeId, ctx.user.id, ctx.user.role);
      const db = await getDb();

      const [order] = await db.select().from(storeOrders).where(and(eq(storeOrders.id, input.orderId), eq(storeOrders.storeId, input.storeId))).limit(1);
      if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "الطلب غير موجود" });
      if (order.status === "delivered") throw new TRPCError({ code: "BAD_REQUEST", message: "الطلب مُسلَّم مسبقاً" });
      if (order.status === "cancelled") throw new TRPCError({ code: "BAD_REQUEST", message: "لا يمكن تسليم طلب ملغى" });

      const [product] = await db.select().from(storeProducts).where(eq(storeProducts.id, order.productId)).limit(1);
      if (!product) throw new TRPCError({ code: "NOT_FOUND", message: "المنتج غير موجود" });

      // سحب الكرت المناسب
      let card: typeof radiusCards.$inferSelect | null = null;

      if (input.cardId) {
        // اختيار يدوي من العميل
        const [c] = await db.select().from(radiusCards).where(
          and(
            eq(radiusCards.id, input.cardId),
            eq(radiusCards.status, "unused")
          )
        ).limit(1);
        card = c ?? null;
        if (!card) throw new TRPCError({ code: "BAD_REQUEST", message: "الكرت المحدد غير متاح" });
      } else if (order.cardId) {
        // استخدام الكرت المحجوز لهذا الطلب
        const [c] = await db.select().from(radiusCards).where(
          and(
            eq(radiusCards.id, order.cardId),
            eq(radiusCards.reservedOrderId, input.orderId),
            eq(radiusCards.status, "reserved")
          )
        ).limit(1);
        card = c ?? null;

        // إذا لم يكن محجوزاً (ربما أُلغي الحجز)، ابحث عن كرت آخر
        if (!card && product.batchId) {
          const reserved = await atomicReserveCard(product.batchId, store.ownerId, input.orderId);
          card = reserved;
        }
      } else if (product.batchId) {
        // طلب قديم بدون حجز — احجز كرتاً الآن
        const reserved = await atomicReserveCard(product.batchId, store.ownerId, input.orderId);
        card = reserved;
      }

      if (!card) throw new TRPCError({ code: "BAD_REQUEST", message: "لا توجد كروت متاحة لهذه الباقة" });

      // تحديث الطلب إلى delivered
      await db.update(storeOrders).set({
        status: "delivered",
        cardId: card.id,
        cardUsername: card.username,
        cardPassword: card.password ?? null,
        updatedAt: new Date(),
      }).where(eq(storeOrders.id, input.orderId));

      // إرسال SMS للزبون إذا كان SMS مفعّلاً للعميل ومفعّل لمتجر البطاقات
      let smsSent = false;
      try {
        const [channel] = await db.select({ smsAdminEnabled: notificationChannels.smsAdminEnabled })
          .from(notificationChannels)
          .where(and(
            eq(notificationChannels.ownerId, store.ownerId),
            eq(notificationChannels.channel, 'sms')
          ))
          .limit(1);

                const [prefs] = await db.select({ storeOrderSms: notificationPreferences.storeOrderSms, storeOrderSmsTemplate: notificationPreferences.storeOrderSmsTemplate })
          .from(notificationPreferences)
          .where(and(
            eq(notificationPreferences.ownerId, store.ownerId),
            eq(notificationPreferences.channel, 'sms')
          ))
          .limit(1);
        if (channel?.smsAdminEnabled && prefs?.storeOrderSms && order.customerPhone) {
          const msg = buildStoreOrderSms(
            order.customerName ?? '',
            [{ username: card.username, password: card.password ?? null }],
            prefs.storeOrderSmsTemplate
          );
          await tweetsmsService.sendSmsTenant(store.ownerId, order.customerPhone, msg, { type: 'automatic', triggeredBy: 'store_order_auto_deliver' });
          smsSent = true;
          await db.update(storeOrders).set({ smsSent: true }).where(eq(storeOrders.id, input.orderId));
        }
      } catch (_) {
        // SMS فشل — لا نوقف العملية
      }

      // التحقق من نفاذ المخزون
      if (product.batchId) {
        const remaining = await getAvailableStockCount(product.batchId, store.ownerId);
        if (remaining <= product.stockThreshold) {
          // TODO: إرسال تنبيه للعميل عند نفاذ المخزون
        }
      }

      return { success: true, cardUsername: card.username, cardPassword: card.password, smsSent };
    }),

  /**
   * إلغاء طلب مع تحرير الكرت المحجوز
   *
   * يُحرر الكرت المحجوز (status='unused') حتى يصبح متاحاً لطلبات أخرى
   */
  cancelOrder: protectedProcedure
    .input(z.object({ orderId: z.number(), storeId: z.number(), reason: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      await assertStoreOwnership(input.storeId, ctx.user.id, ctx.user.role);
      const db = await getDb();

      // جلب الطلب للتحقق من وجود كرت محجوز
      const [order] = await db.select().from(storeOrders).where(
        and(eq(storeOrders.id, input.orderId), eq(storeOrders.storeId, input.storeId))
      ).limit(1);

      if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "الطلب غير موجود" });
      if (order.status === "delivered") throw new TRPCError({ code: "BAD_REQUEST", message: "لا يمكن إلغاء طلب مُسلَّم" });

      // تحرير الكرت المحجوز إذا كان موجوداً
      if (order.cardId) {
        await db.update(radiusCards).set({
          status: "unused",
          reservedOrderId: null,
          reservedAt: null,
        }).where(
          and(
            eq(radiusCards.id, order.cardId),
            eq(radiusCards.status, "reserved"),
            eq(radiusCards.reservedOrderId, input.orderId)
          )
        );
      }

      // إلغاء الطلب
      await db.update(storeOrders).set({
        status: "cancelled",
        notes: input.reason ?? order.notes ?? null,
        updatedAt: new Date(),
      }).where(and(eq(storeOrders.id, input.orderId), eq(storeOrders.storeId, input.storeId)));

      return { success: true };
    }),

  // ─── Stats ────────────────────────────────────────────────────────────────

  /** إحصائيات المتجر للعميل */
  getStoreStats: protectedProcedure
    .input(z.object({ storeId: z.number() }))
    .query(async ({ ctx, input }) => {
      const store = await assertStoreOwnership(input.storeId, ctx.user.id, ctx.user.role);
      const db = await getDb();

      const [stats] = await db
        .select({
          total: count(),
          pending: sql<number>`SUM(CASE WHEN ${storeOrders.status} = 'pending' THEN 1 ELSE 0 END)`,
          confirmed: sql<number>`SUM(CASE WHEN ${storeOrders.status} = 'confirmed' THEN 1 ELSE 0 END)`,
          delivered: sql<number>`SUM(CASE WHEN ${storeOrders.status} = 'delivered' THEN 1 ELSE 0 END)`,
          cancelled: sql<number>`SUM(CASE WHEN ${storeOrders.status} = 'cancelled' THEN 1 ELSE 0 END)`,
          revenue: sql<number>`SUM(CASE WHEN ${storeOrders.status} = 'delivered' THEN CAST(${storeOrders.amount} AS DECIMAL(10,2)) ELSE 0 END)`,
        })
        .from(storeOrders)
        .where(eq(storeOrders.storeId, input.storeId));

      return {
        total: Number(stats?.total ?? 0),
        pending: Number(stats?.pending ?? 0),
        confirmed: Number(stats?.confirmed ?? 0),
        delivered: Number(stats?.delivered ?? 0),
        cancelled: Number(stats?.cancelled ?? 0),
        revenue: Number(stats?.revenue ?? 0),
      };
    }),

  // ─── Super Admin ──────────────────────────────────────────────────────────

  /** جميع المتاجر (للسوبر أدمن) */
  getAllStores: superAdminProcedure.query(async () => {
    const db = await getDb();
    const allStores = await db
      .select({
        id: stores.id,
        ownerId: stores.ownerId,
        slug: stores.slug,
        name: stores.name,
        active: stores.active,
        createdAt: stores.createdAt,
        ownerName: users.name,
      })
      .from(stores)
      .leftJoin(users, eq(stores.ownerId, users.id))
      .orderBy(desc(stores.createdAt));

    return allStores;
  }),

  // =========================================================================
  // PUBLIC: تتبع الطلب بالـ token
  // =========================================================================

  /** جلب طلب بالـ token (للزبون بدون تسجيل دخول) */
  getOrderByToken: publicProcedure
    .input(z.object({ token: z.string().min(10) }))
    .query(async ({ input }) => {
      const db = await getDb();
      const [order] = await db
        .select({
          id: storeOrders.id,
          orderToken: storeOrders.orderToken,
          status: storeOrders.status,
          customerName: storeOrders.customerName,
          customerPhone: storeOrders.customerPhone,
          amount: storeOrders.amount,
          notes: storeOrders.notes,
          smsSent: storeOrders.smsSent,
          receiptUrl: storeOrders.receiptUrl,
          createdAt: storeOrders.createdAt,
          updatedAt: storeOrders.updatedAt,
          // بيانات الكرت فقط عند التسليم
          cardUsername: storeOrders.cardUsername,
          cardPassword: storeOrders.cardPassword,
          cardsData: storeOrders.cardsData,
          quantity: storeOrders.quantity,
          // بيانات المنتج
          productId: storeOrders.productId,
          storeId: storeOrders.storeId,
        })
        .from(storeOrders)
        .where(eq(storeOrders.orderToken, input.token))
        .limit(1);
      if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "الطلب غير موجود" });
      // جلب اسم المنتج
      const [product] = await db.select({ name: storeProducts.name, description: storeProducts.description })
        .from(storeProducts).where(eq(storeProducts.id, order.productId)).limit(1);
      return { ...order, productName: product?.name ?? '', productDescription: product?.description ?? '' };
    }),

  /** جلب طلبات الزبون برقم الجوال (بدون تسجيل دخول) */
  getMyOrders: publicProcedure
    .input(z.object({ storeId: z.number(), phone: z.string().min(7) }))
    .query(async ({ input }) => {
      const db = await getDb();
      const orders = await db
        .select({
          id: storeOrders.id,
          orderToken: storeOrders.orderToken,
          status: storeOrders.status,
          customerName: storeOrders.customerName,
          amount: storeOrders.amount,
          smsSent: storeOrders.smsSent,
          createdAt: storeOrders.createdAt,
          // بيانات الكرت فقط عند التسليم
          cardUsername: storeOrders.cardUsername,
          cardPassword: storeOrders.cardPassword,
          cardsData: storeOrders.cardsData,
          quantity: storeOrders.quantity,
          productId: storeOrders.productId,
        })
        .from(storeOrders)
        .where(and(
          eq(storeOrders.storeId, input.storeId),
          eq(storeOrders.customerPhone, input.phone)
        ))
        .orderBy(desc(storeOrders.createdAt))
        .limit(20);
      // جلب أسماء المنتجات
      const productIds = Array.from(new Set(orders.map((o: any) => o.productId as number)));
      const products = productIds.length > 0
        ? await db.select({ id: storeProducts.id, name: storeProducts.name })
            .from(storeProducts)
            .where(sql`${storeProducts.id} IN (${sql.join(productIds.map(id => sql`${id}`), sql`, `)})`)
        : [];
      const productMap = Object.fromEntries(products.map((p: any) => [p.id, p.name]));
      return orders.map((o: any) => ({ ...o, productName: productMap[o.productId] ?? '' }));
    }),

  /** تسليم الكرت عبر SMS من لوحة التحكم */
  deliverOrderBySms: protectedProcedure
    .input(z.object({ orderId: z.number(), storeId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const store = await assertStoreOwnership(input.storeId, ctx.user.id, ctx.user.role);
      const db = await getDb();
      const [order] = await db.select().from(storeOrders)
        .where(and(eq(storeOrders.id, input.orderId), eq(storeOrders.storeId, input.storeId)))
        .limit(1);
      if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "الطلب غير موجود" });
      if (!order.cardUsername) throw new TRPCError({ code: "BAD_REQUEST", message: "الكرت لم يتم تسليمه بعد" });
      if (!order.customerPhone) throw new TRPCError({ code: "BAD_REQUEST", message: "لا يوجد رقم جوال للزبون" });
      // التحقق من SMS مفعّل (أدمن + متجر البطاقات)
      const [channel] = await db.select({ smsAdminEnabled: notificationChannels.smsAdminEnabled })
        .from(notificationChannels)
        .where(and(
          eq(notificationChannels.ownerId, store.ownerId),
          eq(notificationChannels.channel, 'sms')
        ))
        .limit(1);
      const [prefs] = await db.select({ storeOrderSms: notificationPreferences.storeOrderSms })
        .from(notificationPreferences)
        .where(and(
          eq(notificationPreferences.ownerId, store.ownerId),
          eq(notificationPreferences.channel, 'sms')
        ))
        .limit(1);
      if (!channel?.smsAdminEnabled) throw new TRPCError({ code: "FORBIDDEN", message: "خدمة SMS غير مفعّلة لهذا المتجر" });
      if (!prefs?.storeOrderSms) throw new TRPCError({ code: "FORBIDDEN", message: "خدمة SMS غير مفعّلة لمتجر البطاقات — فعّلها من إعدادات SMS" });
      // بناء رسالة SMS باستخدام القالب المخصص (بدون رابط)
      // جلب كل الكروت المسلّمة في هذا الطلب (cardsData) لدمجها في رسالة واحدة
      const deliveredCards: Array<{ username: string; password: string | null }> = (() => {
        if (order.cardsData) {
          try { return JSON.parse(order.cardsData); } catch { /* ignore */ }
        }
        return order.cardUsername ? [{ username: order.cardUsername, password: order.cardPassword ?? null }] : [];
      })();
      const msg = buildStoreOrderSms(
        order.customerName ?? '',
        deliveredCards.length > 0 ? deliveredCards : [{ username: order.cardUsername ?? '', password: order.cardPassword ?? null }],
        prefs.storeOrderSmsTemplate
      );
      await tweetsmsService.sendSmsTenant(store.ownerId, order.customerPhone, msg, { type: 'automatic', triggeredBy: 'store_order_manual_sms' });
      await db.update(storeOrders).set({ smsSent: true }).where(eq(storeOrders.id, input.orderId));
      return { success: true };
    }),

  /**
   * تسليم جزئي — الأدمن يسلّم عدداً محدداً من الكروت
   * الباقي يبقى محجوزاً بحالة 'partial'
   */
  partialDeliver: protectedProcedure
    .input(
      z.object({
        orderId: z.number(),
        storeId: z.number(),
        deliverCount: z.number().int().min(1), // كم كرت تسلّم الآن
      })
    )
    .mutation(async ({ ctx, input }) => {
      const store = await assertStoreOwnership(input.storeId, ctx.user.id, ctx.user.role);
      const db = await getDb();

      const [order] = await db.select().from(storeOrders)
        .where(and(eq(storeOrders.id, input.orderId), eq(storeOrders.storeId, input.storeId)))
        .limit(1);
      if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "الطلب غير موجود" });
      if (order.status === "delivered") throw new TRPCError({ code: "BAD_REQUEST", message: "الطلب مُسلَّم بالكامل مسبقاً" });
      if (order.status === "cancelled") throw new TRPCError({ code: "BAD_REQUEST", message: "لا يمكن تسليم طلب ملغى" });

      // قائمة الكروت المحجوزة (من cardIds أو remainingCardIds)
      const allReservedIds: number[] = (() => {
        const src = order.remainingCardIds ?? order.cardIds;
        if (!src) return order.cardId ? [order.cardId] : [];
        try { return JSON.parse(src) as number[]; } catch { return []; }
      })();

      const alreadyDelivered = order.deliveredCount ?? 0;
      const totalQty = order.quantity;
      const remaining = totalQty - alreadyDelivered;

      if (input.deliverCount > remaining) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `لا يمكن تسليم ${input.deliverCount} كروت، المتبقي ${remaining} فقط` });
      }

      // الكروت التي ستُسلَّم الآن
      const toDeliverIds = allReservedIds.slice(0, input.deliverCount);
      const stillRemainingIds = allReservedIds.slice(input.deliverCount);

      // جلب بيانات الكروت المراد تسليمها
      const cardsToDeliver = await db.select().from(radiusCards)
        .where(sql`${radiusCards.id} IN (${sql.join(toDeliverIds.map(id => sql`${id}`), sql`, `)})`);

      // تحديث حالة الكروت المُسلَّمة → active
      if (toDeliverIds.length > 0) {
        await db.update(radiusCards).set({
          status: "active",
          usedBy: store.ownerId,
          reservedOrderId: null,
          reservedAt: null,
          activatedAt: new Date(),
        }).where(sql`${radiusCards.id} IN (${sql.join(toDeliverIds.map(id => sql`${id}`), sql`, `)})`); 
      }

      const newDeliveredCount = alreadyDelivered + input.deliverCount;
      const isFullyDelivered = newDeliveredCount >= totalQty;

      // بناء cardsData المُجمَّعة (الكروت المُسلَّمة حتى الآن)
      const prevCardsData: Array<{ username: string; password: string | null }> = (() => {
        try { return order.cardsData ? JSON.parse(order.cardsData) : []; } catch { return []; }
      })();
      const newCardsData = [
        ...prevCardsData,
        ...cardsToDeliver.map((c: typeof radiusCards.$inferSelect) => ({ username: c.username, password: c.password ?? null })),
      ];

      // تحديث الطلب
      await db.update(storeOrders).set({
        status: isFullyDelivered ? "delivered" : "partial",
        deliveredCount: newDeliveredCount,
        remainingCardIds: stillRemainingIds.length > 0 ? JSON.stringify(stillRemainingIds) : null,
        cardId: cardsToDeliver[0]?.id ?? order.cardId,
        cardUsername: cardsToDeliver[0]?.username ?? order.cardUsername,
        cardPassword: cardsToDeliver[0]?.password ?? order.cardPassword,
        cardsData: JSON.stringify(newCardsData),
        updatedAt: new Date(),
      }).where(eq(storeOrders.id, input.orderId));

      // إرسال SMS للزبون
      let smsSent = false;
      try {
        const [channel] = await db.select({ smsAdminEnabled: notificationChannels.smsAdminEnabled })
          .from(notificationChannels)
          .where(and(eq(notificationChannels.ownerId, store.ownerId), eq(notificationChannels.channel, 'sms')))
          .limit(1);
        const [prefs] = await db.select({ storeOrderSms: notificationPreferences.storeOrderSms, storeOrderSmsTemplate: notificationPreferences.storeOrderSmsTemplate })
          .from(notificationPreferences)
          .where(and(eq(notificationPreferences.ownerId, store.ownerId), eq(notificationPreferences.channel, 'sms')))
          .limit(1);
        if (channel?.smsAdminEnabled && prefs?.storeOrderSms && order.customerPhone) {
          const msg = buildStoreOrderSms(
            order.customerName ?? '',
            cardsToDeliver.map((c: typeof radiusCards.$inferSelect) => ({ username: c.username, password: c.password ?? null })),
            prefs.storeOrderSmsTemplate
          );
          await tweetsmsService.sendSmsTenant(store.ownerId, order.customerPhone, msg, { type: 'automatic', triggeredBy: 'store_order_partial_deliver' });
          smsSent = true;
          await db.update(storeOrders).set({ smsSent: true }).where(eq(storeOrders.id, input.orderId));
        }
      } catch (_) { /* SMS فشل */ }

      return {
        success: true,
        deliveredCount: newDeliveredCount,
        remaining: stillRemainingIds.length,
        isFullyDelivered,
        cards: cardsToDeliver.map((c: typeof radiusCards.$inferSelect) => ({ username: c.username, password: c.password })),
        smsSent,
      };
    }),

  /**
   * إلغاء الكروت المتبقية في طلب جزئي
   * يُحرر الكروت المحجوزة ويُغلق الطلب
   */
  cancelRemaining: protectedProcedure
    .input(z.object({ orderId: z.number(), storeId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await assertStoreOwnership(input.storeId, ctx.user.id, ctx.user.role);
      const db = await getDb();

      const [order] = await db.select().from(storeOrders)
        .where(and(eq(storeOrders.id, input.orderId), eq(storeOrders.storeId, input.storeId)))
        .limit(1);
      if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "الطلب غير موجود" });
      if (order.status !== "partial" && order.status !== "pending" && order.status !== "confirmed") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "لا توجد كروت معلقة في هذا الطلب" });
      }

      // تحرير الكروت المتبقية
      const remainingIds: number[] = (() => {
        const src = order.remainingCardIds ?? (order.status !== "partial" ? order.cardIds : null);
        if (!src) return order.cardId && order.status !== "partial" ? [order.cardId] : [];
        try { return JSON.parse(src) as number[]; } catch { return []; }
      })();

      if (remainingIds.length > 0) {
        await db.update(radiusCards).set({
          status: "unused",
          reservedOrderId: null,
          reservedAt: null,
        }).where(sql`${radiusCards.id} IN (${sql.join(remainingIds.map(id => sql`${id}`), sql`, `)})`); 
      }

      // تحديث الطلب: إذا سُلِّم جزء منه → delivered، وإلا → cancelled
      const deliveredCount = order.deliveredCount ?? 0;
      const newStatus = deliveredCount > 0 ? "delivered" : "cancelled";

      await db.update(storeOrders).set({
        status: newStatus as any,
        remainingCardIds: null,
        updatedAt: new Date(),
      }).where(eq(storeOrders.id, input.orderId));

      return { success: true, freedCards: remainingIds.length, finalStatus: newStatus };
    }),

  /** إرسال رابط تتبع الطلب عبر SMS */
  sendOrderTrackLink: protectedProcedure
    .input(z.object({ orderId: z.number(), storeId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const store = await assertStoreOwnership(input.storeId, ctx.user.id, ctx.user.role);
      const db = await getDb();
      const [order] = await db.select().from(storeOrders)
        .where(and(eq(storeOrders.id, input.orderId), eq(storeOrders.storeId, input.storeId)))
        .limit(1);
      if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "الطلب غير موجود" });
      if (!order.orderToken) throw new TRPCError({ code: "BAD_REQUEST", message: "هذا الطلب لا يحتوي على رابط تتبع" });
      if (!order.customerPhone) throw new TRPCError({ code: "BAD_REQUEST", message: "لا يوجد رقم جوال" });
      const [channel] = await db.select({ smsAdminEnabled: notificationChannels.smsAdminEnabled })
        .from(notificationChannels)
        .where(eq(notificationChannels.ownerId, store.ownerId))
        .limit(1);
      if (!channel?.smsAdminEnabled) throw new TRPCError({ code: "FORBIDDEN", message: "خدمة SMS غير مفعّلة" });
      const siteBase = process.env.VITE_PUBLIC_DOMAIN
        ? `https://${process.env.VITE_PUBLIC_DOMAIN}`
        : 'https://radius-pro.com';
      const [storeRow] = await db.select({ slug: stores.slug }).from(stores).where(eq(stores.id, input.storeId)).limit(1);
      const trackUrl = `${siteBase}/store/${storeRow?.slug ?? input.storeId}/order/${order.orderToken}`;
      const msg = `مرحباً ${order.customerName}،
يمكنك متابعة طلبك عبر الرابط التالي:
${trackUrl}`;
      await tweetsmsService.sendSmsTenant(store.ownerId, order.customerPhone, msg, { type: 'automatic', triggeredBy: 'store_order_track_link' });
      return { success: true, trackUrl };
    }),

  /** إحصائيات المتاجر للسوبر أدمن */
  getAdminStoreStats: superAdminProcedure.query(async () => {
    const db = await getDb();
    const [stats] = await db.select({
      totalStores: count(stores.id),
      activeStores: sql<number>`SUM(CASE WHEN ${stores.active} = 1 THEN 1 ELSE 0 END)`,
    }).from(stores);

    const [orderStats] = await db.select({
      totalOrders: count(storeOrders.id),
      pendingOrders: sql<number>`SUM(CASE WHEN ${storeOrders.status} = 'pending' THEN 1 ELSE 0 END)`,
      deliveredOrders: sql<number>`SUM(CASE WHEN ${storeOrders.status} = 'delivered' THEN 1 ELSE 0 END)`,
      totalRevenue: sql<number>`SUM(CASE WHEN ${storeOrders.status} = 'delivered' THEN CAST(${storeOrders.amount} AS DECIMAL(10,2)) ELSE 0 END)`,
    }).from(storeOrders);

    return {
      totalStores: Number(stats?.totalStores ?? 0),
      activeStores: Number(stats?.activeStores ?? 0),
      totalOrders: Number(orderStats?.totalOrders ?? 0),
      pendingOrders: Number(orderStats?.pendingOrders ?? 0),
      deliveredOrders: Number(orderStats?.deliveredOrders ?? 0),
      totalRevenue: Number(orderStats?.totalRevenue ?? 0),
    };
  }),

  // ─── PIN System — نظام الرقم السري لحماية طلبات المتجر ————————————————————————

  /**
   * التحقق من وجود PIN لرقم جوال معين — عامة
   * يستخدمها الفرونتند لمعرفة هل يجب طلب إنشاء PIN أو إدخاله
   */
  checkPinExists: publicProcedure
    .input(z.object({ storeId: z.number(), phone: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const [row] = await db.select({ id: storePhonePins.id, adminReset: storePhonePins.adminReset })
        .from(storePhonePins)
        .where(and(eq(storePhonePins.storeId, input.storeId), eq(storePhonePins.phone, input.phone)))
        .limit(1);
      return { exists: !!row, adminReset: row?.adminReset ?? false };
    }),

  /**
   * إنشاء PIN جديد لرقم جوال — عامة
   * يُستخدم عند أول طلب أو بعد إعادة تعيين الأدمن
   */
  setPin: publicProcedure
    .input(z.object({
      storeId: z.number(),
      phone: z.string(),
      pin: z.string().length(4).regex(/^\d{4}$/),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const pinHash = await bcrypt.hash(input.pin, 10);
      const [existing] = await db.select({ id: storePhonePins.id })
        .from(storePhonePins)
        .where(and(eq(storePhonePins.storeId, input.storeId), eq(storePhonePins.phone, input.phone)))
        .limit(1);
      if (existing) {
        await db.update(storePhonePins).set({
          pinHash,
          failedAttempts: 0,
          lockedUntil: null,
          adminReset: false,
          otpCode: null,
          otpExpiresAt: null,
          updatedAt: new Date(),
        }).where(eq(storePhonePins.id, existing.id));
      } else {
        await db.insert(storePhonePins).values({
          storeId: input.storeId,
          phone: input.phone,
          pinHash,
        });
      }
      return { success: true };
    }),

  /**
   * التحقق من صحة PIN — عامة
   * يُستخدم عند فتح صفحة التتبع وعند تقديم الطلب
   */
  verifyPin: publicProcedure
    .input(z.object({
      storeId: z.number(),
      phone: z.string(),
      pin: z.string().length(4).regex(/^\d{4}$/),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [row] = await db.select()
        .from(storePhonePins)
        .where(and(eq(storePhonePins.storeId, input.storeId), eq(storePhonePins.phone, input.phone)))
        .limit(1);
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'PIN غير موجود' });
      // تحقق من القفل المؤقت
      if (row.lockedUntil && row.lockedUntil > new Date()) {
        const mins = Math.ceil((row.lockedUntil.getTime() - Date.now()) / 60000);
        throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: `تم قفل الحساب مؤقتاً. حاول بعد ${mins} دقيقة` });
      }
      const isValid = await bcrypt.compare(input.pin, row.pinHash);
      if (!isValid) {
        const newAttempts = (row.failedAttempts ?? 0) + 1;
        const lockUntil = newAttempts >= 5 ? new Date(Date.now() + 15 * 60000) : null; // 15 دقيقة
        await db.update(storePhonePins).set({
          failedAttempts: newAttempts,
          lockedUntil: lockUntil,
          updatedAt: new Date(),
        }).where(eq(storePhonePins.id, row.id));
        const remaining = Math.max(0, 5 - newAttempts);
        throw new TRPCError({ code: 'UNAUTHORIZED', message: remaining > 0 ? `رقم سري خاطئ. متبقي ${remaining} محاولة` : 'تم قفل الحساب 15 دقيقة بسبب محاولات متعددة' });
      }
      // نجح — إعادة عداد المحاولات
      await db.update(storePhonePins).set({ failedAttempts: 0, lockedUntil: null, updatedAt: new Date() })
        .where(eq(storePhonePins.id, row.id));
      return { success: true };
    }),

  /**
   * طلب OTP لإعادة تعيين PIN — عامة
   * يرسل SMS إذا كان SMS مفعّل، وإلا يعرض رسالة للتواصل مع المتجر
   */
  requestPinReset: publicProcedure
    .input(z.object({ storeId: z.number(), phone: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [row] = await db.select({ id: storePhonePins.id })
        .from(storePhonePins)
        .where(and(eq(storePhonePins.storeId, input.storeId), eq(storePhonePins.phone, input.phone)))
        .limit(1);
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'رقم الجوال غير مسجّل' });

      // جلب إعدادات SMS للمتجر
      const [storeRow] = await db.select({ ownerId: stores.ownerId, slug: stores.slug })
        .from(stores).where(eq(stores.id, input.storeId)).limit(1);
      if (!storeRow) throw new TRPCError({ code: 'NOT_FOUND', message: 'المتجر غير موجود' });

      const [channel] = await db.select({ smsAdminEnabled: notificationChannels.smsAdminEnabled })
        .from(notificationChannels)
        .where(and(eq(notificationChannels.ownerId, storeRow.ownerId), eq(notificationChannels.channel, 'sms')))
        .limit(1);

      const [prefs] = await db.select({ storeOrderSms: notificationPreferences.storeOrderSms })
        .from(notificationPreferences)
        .where(and(eq(notificationPreferences.ownerId, storeRow.ownerId), eq(notificationPreferences.channel, 'sms')))
        .limit(1);

      const smsEnabled = channel?.smsAdminEnabled && prefs?.storeOrderSms;

      if (smsEnabled) {
        // إرسال OTP عبر SMS
        const otp = Math.floor(1000 + Math.random() * 9000).toString(); // 4 أرقام
        const otpExpiry = new Date(Date.now() + 10 * 60000); // 10 دقائق
        await db.update(storePhonePins).set({
          otpCode: otp,
          otpExpiresAt: otpExpiry,
          updatedAt: new Date(),
        }).where(eq(storePhonePins.id, row.id));
        const msg = `رمز إعادة تعيين الرقم السري: ${otp}\nصالح لمدة 10 دقائق`;
        await tweetsmsService.sendSmsTenant(storeRow.ownerId, input.phone, msg, { type: 'automatic', triggeredBy: 'store_phone_otp' });
        return { method: 'sms' as const };
      } else {
        // لا يوجد SMS — طلب من الأدمن
        return { method: 'contact_admin' as const };
      }
    }),

  /**
   * التحقق من OTP وتعيين PIN جديد — عامة
   */
  verifyOtpAndSetPin: publicProcedure
    .input(z.object({
      storeId: z.number(),
      phone: z.string(),
      otp: z.string().length(4),
      newPin: z.string().length(4).regex(/^\d{4}$/),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [row] = await db.select()
        .from(storePhonePins)
        .where(and(eq(storePhonePins.storeId, input.storeId), eq(storePhonePins.phone, input.phone)))
        .limit(1);
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'رقم الجوال غير مسجّل' });
      if (!row.otpCode || !row.otpExpiresAt || row.otpExpiresAt < new Date()) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'رمز OTP منتهي أو غير موجود. اطلب رمزاً جديداً' });
      }
      if (row.otpCode !== input.otp) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'رمز OTP خاطئ' });
      }
      const pinHash = await bcrypt.hash(input.newPin, 10);
      await db.update(storePhonePins).set({
        pinHash,
        otpCode: null,
        otpExpiresAt: null,
        failedAttempts: 0,
        lockedUntil: null,
        adminReset: false,
        updatedAt: new Date(),
      }).where(eq(storePhonePins.id, row.id));
      return { success: true };
    }),

  /**
   * إعادة تعيين PIN من قبل الأدمن — محمية
   * يضع adminReset=true حتى يطلب الزبون إنشاء PIN جديد عند الدخول التالي
   */
  adminResetPin: protectedProcedure
    .input(z.object({ storeId: z.number(), phone: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertStoreOwnership(input.storeId, ctx.user.id, ctx.user.role);
      const db = await getDb();
      await db.update(storePhonePins).set({
        adminReset: true,
        failedAttempts: 0,
        lockedUntil: null,
        updatedAt: new Date(),
      }).where(and(eq(storePhonePins.storeId, input.storeId), eq(storePhonePins.phone, input.phone)));
      return { success: true };
    }),
});
