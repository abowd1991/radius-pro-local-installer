import { protectedProcedure, superAdminProcedure, router } from "../_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import * as notificationDb from "../db/notifications";
import * as multiChannelNotification from "../services/multiChannelNotificationService";
import * as tweetsmsService from "../services/tweetsmsService";
import * as smsDb from "../db/sms";
import { getTenantContext, getEffectiveOwnerId, canSeeAllData } from "../tenant-isolation";
import { getDb } from "../db";
import { users } from "../../drizzle/schema";
import { eq, and, sql } from "drizzle-orm";
import { isAdmin } from "../_core/roles";


export const notificationsRouter = router({
  list: protectedProcedure
    .input(z.object({
      unreadOnly: z.boolean().default(false),
      page: z.number().default(1),
      limit: z.number().default(20),
    }).optional())
    .query(async ({ ctx, input }) => {
      const tenantContext = getTenantContext(ctx.user);
      return notificationDb.getNotificationsByTenant(tenantContext, input);
    }),

  markAsRead: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      return notificationDb.markAsRead(input.id, ctx.user.id);
    }),

  markAllAsRead: protectedProcedure.mutation(async ({ ctx }) => {
    return notificationDb.markAllAsRead(ctx.user.id);
  }),

  getUnreadCount: protectedProcedure.query(async ({ ctx }) => {
    return notificationDb.getUnreadCount(ctx.user.id);
  }),

  // SMS Balance Check (Super Admin only)
  getSmsBalance: superAdminProcedure.query(async () => {
    return multiChannelNotification.getSmsBalance();
  }),

  // Send Test SMS (Super Admin only)
  sendTestSms: superAdminProcedure
    .input(z.object({
      phone: z.string().min(9, "رقم الهاتف غير صالح"),
      message: z.string().min(1, "الرسالة مطلوبة").max(160, "الرسالة طويلة جداً"),
    }))
    .mutation(async ({ input }) => {
      const result = await tweetsmsService.sendSms(input.phone, input.message);
      if (!result.success) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: result.errorMessage || 'فشل إرسال الرسالة' });
      }
      return { success: true, smsId: result.smsId };
    }),

  // Send SMS to User (Super Admin only)
  sendSmsToUser: superAdminProcedure
    .input(z.object({
      userId: z.number(),
      message: z.string().min(1).max(160),
    }))
    .mutation(async ({ input }) => {
      const results = await multiChannelNotification.sendCustomNotification(
        input.userId,
        { ar: 'رسالة من الإدارة', en: 'Message from Admin' },
        { ar: input.message, en: input.message },
        ['sms', 'push']
      );
      const smsResult = results.find(r => r.channel === 'sms');
      if (!smsResult?.success) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: smsResult?.error || 'فشل إرسال الرسالة' });
      }
      return { success: true };
    }),

  // Send Bulk SMS (Super Admin only)
  sendBulkSms: superAdminProcedure
    .input(z.object({
      phones: z.array(z.string()).min(1),
      message: z.string().min(1).max(160),
    }))
    .mutation(async ({ ctx, input }) => {
      const result = await tweetsmsService.sendBulkSms(input.phones, input.message, undefined, {
        sentBy: ctx.user.id,
      });
      return result;
    }),

  // ============================================================================
  // SMS LOGS
  // ============================================================================
  
  // Get SMS Logs (Super Admin only)
  getSmsLogs: superAdminProcedure
    .input(z.object({
      page: z.number().default(1),
      limit: z.number().default(20),
      status: z.enum(["pending", "sent", "delivered", "failed"]).optional(),
      type: z.enum(["manual", "bulk", "automatic"]).optional(),
      phone: z.string().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    }).optional())
    .query(async ({ input }) => {
      return smsDb.getSmsLogs({
        ...input,
        startDate: input?.startDate ? new Date(input.startDate) : undefined,
        endDate: input?.endDate ? new Date(input.endDate) : undefined,
      });
    }),

  // Get SMS Stats (Super Admin only)
  getSmsStats: superAdminProcedure.query(async () => {
    return smsDb.getSmsStats();
  }),

  // ============================================================================
  // SMS TEMPLATES
  // ============================================================================
  
  // Get SMS Templates (Super Admin only)
  getSmsTemplates: superAdminProcedure
    .input(z.object({ activeOnly: z.boolean().default(false) }).optional())
    .query(async ({ input }) => {
      return smsDb.getSmsTemplates(input?.activeOnly);
    }),

  // Get SMS Template by ID (Super Admin only)
  getSmsTemplate: superAdminProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const template = await smsDb.getSmsTemplateById(input.id);
      if (!template) {
        throw new TRPCError({ code: "NOT_FOUND", message: "القالب غير موجود" });
      }
      return template;
    }),

  // Create SMS Template (Super Admin only)
  createSmsTemplate: superAdminProcedure
    .input(z.object({
      name: z.string().min(1).max(100),
      nameAr: z.string().max(100).optional(),
      content: z.string().min(1),
      contentAr: z.string().optional(),
      type: z.enum(["subscription_expiry", "welcome", "payment_reminder", "custom"]).default("custom"),
      isActive: z.boolean().default(true),
    }))
    .mutation(async ({ input }) => {
      const id = await smsDb.createSmsTemplate(input);
      return { id, success: true };
    }),

  // Update SMS Template (Super Admin only)
  updateSmsTemplate: superAdminProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).max(100).optional(),
      nameAr: z.string().max(100).optional(),
      content: z.string().min(1).optional(),
      contentAr: z.string().optional(),
      type: z.enum(["subscription_expiry", "welcome", "payment_reminder", "custom"]).optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      await smsDb.updateSmsTemplate(id, data);
      return { success: true };
    }),

  // Delete SMS Template (Super Admin only)
  deleteSmsTemplate: superAdminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      try {
        await smsDb.deleteSmsTemplate(input.id);
        return { success: true };
      } catch (error) {
        if (error instanceof Error && error.message.includes("system")) {
          throw new TRPCError({ code: "FORBIDDEN", message: "لا يمكن حذف قوالب النظام" });
        }
        throw error;
      }
    }),

  // Send SMS with Template (Super Admin only)
  sendSmsWithTemplate: superAdminProcedure
    .input(z.object({
      phone: z.string().min(9),
      templateId: z.number(),
      variables: z.record(z.string(), z.union([z.string(), z.number()])),
      language: z.enum(["ar", "en"]).default("ar"),
    }))
    .mutation(async ({ ctx, input }) => {
      const template = await smsDb.getSmsTemplateById(input.templateId);
      if (!template) {
        throw new TRPCError({ code: "NOT_FOUND", message: "القالب غير موجود" });
      }
      
      const content = input.language === "ar" && template.contentAr 
        ? template.contentAr 
        : template.content;
      
      const message = smsDb.replaceTemplateVariables(content, input.variables);
      
      const result = await tweetsmsService.sendSms(input.phone, message, undefined, {
        templateId: template.id,
        sentBy: ctx.user.id,
        type: "manual",
      });
      
      if (!result.success) {
        throw new TRPCError({ code: "BAD_REQUEST", message: result.errorMessage || "فشل إرسال الرسالة" });
      }
      
      return { success: true, smsId: result.smsId };
    }),
});

