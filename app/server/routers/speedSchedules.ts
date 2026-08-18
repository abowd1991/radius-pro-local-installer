/**
 * Speed Schedules Router
 * =======================
 * tRPC CRUD API لإدارة جداول السرعة الزمنية للباقات.
 */

import { protectedProcedure, router } from '../_core/trpc.js';
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { getDb } from '../db.js';
import { speedSchedules, plans } from '../../drizzle/schema.js';
import { eq, and } from 'drizzle-orm';
import { speedSchedulerService } from '../services/speedSchedulerService.js';
import { getTenantContext, getEffectiveOwnerId, canSeeAllData } from '../tenant-isolation.js';

// ─── Validation Schemas ───────────────────────────────────────────────────────

const daysOfWeekSchema = z.array(z.number().min(0).max(6)).min(1, 'يجب اختيار يوم واحد على الأقل');

const scheduleInputSchema = z.object({
  planId: z.number().int().positive(),
  name: z.string().min(1, 'الاسم مطلوب').max(128),
  startHour: z.number().int().min(0).max(23),
  startMinute: z.number().int().min(0).max(59).default(0),
  endHour: z.number().int().min(0).max(23),
  endMinute: z.number().int().min(0).max(59).default(0),
  daysOfWeek: daysOfWeekSchema,
  downloadKbps: z.number().int().positive('سرعة التحميل يجب أن تكون موجبة'),
  uploadKbps: z.number().int().positive('سرعة الرفع يجب أن تكون موجبة'),
  isActive: z.boolean().default(true),
  priority: z.number().int().min(0).max(100).default(0),
});

// ─── Router ───────────────────────────────────────────────────────────────────

export const speedSchedulesRouter = router({

  /**
   * جلب جميع جداول السرعة لباقة معينة
   */
  getByPlan: protectedProcedure
    .input(z.object({ planId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB not available' });

      const tenantCtx = getTenantContext(ctx.user);
      const ownerId = getEffectiveOwnerId(tenantCtx);
      const isAdmin = canSeeAllData(tenantCtx);

      // التحقق من وجود الباقة — المدير يرى كل الباقات بدون قيد الملكية
      const [plan] = await db
        .select({ id: plans.id })
        .from(plans)
        .where(
          isAdmin
            ? eq(plans.id, input.planId)
            : and(eq(plans.id, input.planId), eq(plans.ownerId, ownerId))
        );

      if (!plan) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'الباقة غير موجودة' });
      }

      const schedules = await db
        .select()
        .from(speedSchedules)
        .where(
          isAdmin
            ? eq(speedSchedules.planId, input.planId)
            : and(eq(speedSchedules.planId, input.planId), eq(speedSchedules.ownerId, ownerId))
        );

      return schedules;
    }),

  /**
   * إنشاء جدول سرعة جديد
   */
  create: protectedProcedure
    .input(scheduleInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB not available' });

      const tenantCtx = getTenantContext(ctx.user);
      const ownerId = getEffectiveOwnerId(tenantCtx);
      const isAdmin = canSeeAllData(tenantCtx);

      // التحقق من وجود الباقة
      const [plan] = await db
        .select({ id: plans.id, ownerId: plans.ownerId })
        .from(plans)
        .where(
          isAdmin
            ? eq(plans.id, input.planId)
            : and(eq(plans.id, input.planId), eq(plans.ownerId, ownerId))
        );

      if (!plan) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'الباقة غير موجودة' });
      }

      // استخدام ownerId الباقة الفعلي عند الإنشاء
      const effectiveOwnerId = isAdmin ? (plan.ownerId ?? ownerId) : ownerId;

      const result = await db.insert(speedSchedules).values({
        ownerId: effectiveOwnerId,
        planId: input.planId,
        name: input.name,
        startHour: input.startHour,
        startMinute: input.startMinute ?? 0,
        endHour: input.endHour,
        endMinute: input.endMinute ?? 0,
        daysOfWeek: input.daysOfWeek,
        downloadKbps: input.downloadKbps,
        uploadKbps: input.uploadKbps,
        isActive: input.isActive,
        priority: input.priority,
      });

      const newId = (result as any).insertId as number;

      // تحديث Redis Scheduler
      await speedSchedulerService.syncSchedulesToRedis().catch(e =>
        console.error('[SpeedSchedules] Redis sync error:', e.message)
      );
      await speedSchedulerService.invalidatePlanCache(input.planId).catch(() => {});

      // تطبيق الجدول فوراً إذا كان الوقت الحالي ضمن نطاقه
      await speedSchedulerService.applyIfActive({
        id: newId,
        planId: input.planId,
        startHour: input.startHour,
        startMinute: input.startMinute ?? 0,
        endHour: input.endHour,
        endMinute: input.endMinute ?? 0,
        daysOfWeek: input.daysOfWeek,
        downloadKbps: input.downloadKbps,
        uploadKbps: input.uploadKbps,
        isActive: input.isActive,
      }).catch(e => console.error('[SpeedSchedules] applyIfActive error:', e.message));

      return { id: newId, success: true };
    }),

  /**
   * تحديث جدول سرعة موجود
   */
  update: protectedProcedure
    .input(z.object({
      id: z.number().int().positive(),
      data: scheduleInputSchema.partial(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB not available' });

      const tenantCtx = getTenantContext(ctx.user);
      const ownerId = getEffectiveOwnerId(tenantCtx);
      const isAdmin = canSeeAllData(tenantCtx);

      // التحقق من الوجود
      const [existing] = await db
        .select()
        .from(speedSchedules)
        .where(
          isAdmin
            ? eq(speedSchedules.id, input.id)
            : and(eq(speedSchedules.id, input.id), eq(speedSchedules.ownerId, ownerId))
        );

      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'الجدول غير موجود' });
      }

      await db
        .update(speedSchedules)
        .set(input.data)
        .where(
          isAdmin
            ? eq(speedSchedules.id, input.id)
            : and(eq(speedSchedules.id, input.id), eq(speedSchedules.ownerId, ownerId))
        );

      // تحديث Redis Scheduler
      await speedSchedulerService.syncSchedulesToRedis().catch(e =>
        console.error('[SpeedSchedules] Redis sync error:', e.message)
      );
      await speedSchedulerService.invalidatePlanCache(existing.planId).catch(() => {});

      // تطبيق التعديل فوراً إذا كان الوقت الحالي ضمن نطاق الجدول المحدَّث
      const merged = { ...existing, ...input.data };
      await speedSchedulerService.applyIfActive({
        id: input.id,
        planId: existing.planId,
        startHour: merged.startHour ?? existing.startHour,
        startMinute: merged.startMinute ?? existing.startMinute ?? 0,
        endHour: merged.endHour ?? existing.endHour,
        endMinute: merged.endMinute ?? existing.endMinute ?? 0,
        daysOfWeek: (merged.daysOfWeek ?? existing.daysOfWeek) as number[],
        downloadKbps: merged.downloadKbps ?? existing.downloadKbps,
        uploadKbps: merged.uploadKbps ?? existing.uploadKbps,
        isActive: merged.isActive ?? existing.isActive,
      }).catch(e => console.error('[SpeedSchedules] applyIfActive error:', e.message));

      return { success: true };
    }),

  /**
   * حذف جدول سرعة
   */
  delete: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB not available' });

      const tenantCtx = getTenantContext(ctx.user);
      const ownerId = getEffectiveOwnerId(tenantCtx);
      const isAdmin = canSeeAllData(tenantCtx);

      const [existing] = await db
        .select()
        .from(speedSchedules)
        .where(
          isAdmin
            ? eq(speedSchedules.id, input.id)
            : and(eq(speedSchedules.id, input.id), eq(speedSchedules.ownerId, ownerId))
        );

      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'الجدول غير موجود' });
      }

      await db
        .delete(speedSchedules)
        .where(
          isAdmin
            ? eq(speedSchedules.id, input.id)
            : and(eq(speedSchedules.id, input.id), eq(speedSchedules.ownerId, ownerId))
        );

      // تحديث Redis Scheduler
      await speedSchedulerService.syncSchedulesToRedis().catch(e =>
        console.error('[SpeedSchedules] Redis sync error:', e.message)
      );
      await speedSchedulerService.invalidatePlanCache(existing.planId).catch(() => {});

      // إرجاع السرعة الأصلية للكروت بعد حذف الجدول
      await speedSchedulerService.restorePlanSpeed(existing.planId)
        .catch(e => console.error('[SpeedSchedules] restorePlanSpeed error:', e.message));

      return { success: true };
    }),

  /**
   * تفعيل/تعطيل جدول سرعة
   */
  toggleActive: protectedProcedure
    .input(z.object({
      id: z.number().int().positive(),
      isActive: z.boolean(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB not available' });

      const tenantCtx = getTenantContext(ctx.user);
      const ownerId = getEffectiveOwnerId(tenantCtx);
      const isAdmin = canSeeAllData(tenantCtx);

      const [existing] = await db
        .select()
        .from(speedSchedules)
        .where(
          isAdmin
            ? eq(speedSchedules.id, input.id)
            : and(eq(speedSchedules.id, input.id), eq(speedSchedules.ownerId, ownerId))
        );

      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'الجدول غير موجود' });
      }

      await db
        .update(speedSchedules)
        .set({ isActive: input.isActive })
        .where(
          isAdmin
            ? eq(speedSchedules.id, input.id)
            : and(eq(speedSchedules.id, input.id), eq(speedSchedules.ownerId, ownerId))
        );

      await speedSchedulerService.syncSchedulesToRedis().catch(() => {});
      await speedSchedulerService.invalidatePlanCache(existing.planId).catch(() => {});

      if (input.isActive) {
        // تفعيل: تطبيق الجدول فوراً إذا كان الوقت ضمن نطاقه
        await speedSchedulerService.applyIfActive({
          id: input.id,
          planId: existing.planId,
          startHour: existing.startHour,
          startMinute: existing.startMinute ?? 0,
          endHour: existing.endHour,
          endMinute: existing.endMinute ?? 0,
          daysOfWeek: existing.daysOfWeek as number[],
          downloadKbps: existing.downloadKbps,
          uploadKbps: existing.uploadKbps,
          isActive: true,
        }).catch(e => console.error('[SpeedSchedules] applyIfActive error:', e.message));
      } else {
        // تعطيل: إرجاع السرعة الأصلية
        await speedSchedulerService.restorePlanSpeed(existing.planId)
          .catch(e => console.error('[SpeedSchedules] restorePlanSpeed error:', e.message));
      }

      return { success: true };
    }),

  /**
   * تطبيق سرعة الباقة الحالية فوراً (يدوي من الواجهة)
   * يحدد السرعة المناسبة (جدول نشط أو سرعة أصلية) ويطبقها على جميع الكروت + CoA للمتصلين
   */
  applyNow: protectedProcedure
    .input(z.object({ planId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB not available' });

      const tenantCtx = getTenantContext(ctx.user);
      const ownerId = getEffectiveOwnerId(tenantCtx);
      const isAdmin = canSeeAllData(tenantCtx);

      // التحقق من وجود الباقة وملكيتها
      const [plan] = await db
        .select({ id: plans.id })
        .from(plans)
        .where(
          isAdmin
            ? eq(plans.id, input.planId)
            : and(eq(plans.id, input.planId), eq(plans.ownerId, ownerId))
        );

      if (!plan) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'الباقة غير موجودة' });
      }

      const result = await speedSchedulerService.applyNow(input.planId);
      return result;
    }),

  /**
   * إحصائيات CoA Queue الحالية
   */
  getQueueStats: protectedProcedure
    .query(async () => {
      const { speedQueueService } = await import('../services/speedQueueService.js');
      return speedQueueService.getQueueStats();
    }),
});
