import { z } from "zod";
import { router, superAdminProcedure, publicProcedure } from "../_core/trpc.js";
import { getDb } from "../db.js";
import { siteSettings, subscriptionPlans, systemSettings } from "../../drizzle/schema.js";
import { eq, sql } from "drizzle-orm";

export const siteRouter = router({
  // ============================================================================
  // SITE SETTINGS
  // ============================================================================

  getSiteSettings: superAdminProcedure.query(async () => {
    const db = await getDb();
    const settings = await db.select().from(siteSettings).limit(1);
    return settings[0] || null;
  }),

  // Public: all site settings for the landing page (no sensitive data)
  getPublicSiteSettings: publicProcedure.query(async () => {
    const db = await getDb();
    const settings = await db.select({
      siteName: siteSettings.siteName,
      siteNameAr: siteSettings.siteNameAr,
      tagline: siteSettings.tagline,
      taglineAr: siteSettings.taglineAr,
      logoUrl: siteSettings.logoUrl,
      faviconUrl: siteSettings.faviconUrl,
      heroTitle: siteSettings.heroTitle,
      heroTitleAr: siteSettings.heroTitleAr,
      heroSubtitle: siteSettings.heroSubtitle,
      heroSubtitleAr: siteSettings.heroSubtitleAr,
      heroDescription: siteSettings.heroDescription,
      heroDescriptionAr: siteSettings.heroDescriptionAr,
      uptimePercent: siteSettings.uptimePercent,
      activeClients: siteSettings.activeClients,
      managedCards: siteSettings.managedCards,
      supportHours: siteSettings.supportHours,
      supportEmail: siteSettings.supportEmail,
      supportPhone: siteSettings.supportPhone,
      whatsappNumber: siteSettings.whatsappNumber,
      supportHoursText: siteSettings.supportHoursText,
      supportHoursTextAr: siteSettings.supportHoursTextAr,
      companyName: siteSettings.companyName,
      companyNameAr: siteSettings.companyNameAr,
      copyrightText: siteSettings.copyrightText,
      copyrightTextAr: siteSettings.copyrightTextAr,
      facebookUrl: siteSettings.facebookUrl,
      twitterUrl: siteSettings.twitterUrl,
      linkedinUrl: siteSettings.linkedinUrl,
      instagramUrl: siteSettings.instagramUrl,
      metaTitle: siteSettings.metaTitle,
      metaTitleAr: siteSettings.metaTitleAr,
      metaDescription: siteSettings.metaDescription,
      metaDescriptionAr: siteSettings.metaDescriptionAr,
    }).from(siteSettings).limit(1);
    // Return defaults if no row exists yet
    return settings[0] || {
      siteName: 'Radius Pro', siteNameAr: 'راديوس برو',
      tagline: null, taglineAr: null,
      logoUrl: null, faviconUrl: null,
      heroTitle: 'منصة إدارة خدمات الإنترنت المتكاملة',
      heroTitleAr: 'منصة إدارة خدمات الإنترنت المتكاملة',
      heroSubtitle: 'نظام RADIUS SaaS متكامل لإدارة مزودي خدمات الإنترنت',
      heroSubtitleAr: 'نظام RADIUS SaaS متكامل لإدارة مزودي خدمات الإنترنت',
      heroDescription: null, heroDescriptionAr: null,
      uptimePercent: '99.9%', activeClients: '+1000',
      managedCards: '+50K', supportHours: '24/7',
      supportEmail: 'support@radius-pro.com',
      supportPhone: null, whatsappNumber: null,
      supportHoursText: null, supportHoursTextAr: null,
      companyName: 'Radius Pro', companyNameAr: 'راديوس برو',
      copyrightText: null, copyrightTextAr: null,
      facebookUrl: null, twitterUrl: null,
      linkedinUrl: null, instagramUrl: null,
      metaTitle: null, metaTitleAr: null,
      metaDescription: null, metaDescriptionAr: null,
    };
  }),

  // Public: only expose whatsapp number for the contact button on landing page
  getPublicContact: publicProcedure.query(async () => {
    const db = await getDb();
    const settings = await db.select({
      whatsappNumber: siteSettings.whatsappNumber,
      supportPhone: siteSettings.supportPhone,
    }).from(siteSettings).limit(1);
    return settings[0] || null;
  }),

  updateSiteSettings: superAdminProcedure
    .input(
      z.object({
        siteName: z.string().optional(),
        siteNameAr: z.string().optional(),
        tagline: z.string().optional(),
        taglineAr: z.string().optional(),
        logoUrl: z.string().nullable().optional(),
        faviconUrl: z.string().nullable().optional(),
        heroTitle: z.string().optional(),
        heroTitleAr: z.string().optional(),
        heroSubtitle: z.string().optional(),
        heroSubtitleAr: z.string().optional(),
        heroDescription: z.string().optional(),
        heroDescriptionAr: z.string().optional(),
        uptimePercent: z.string().optional(),
        activeClients: z.string().optional(),
        managedCards: z.string().optional(),
        supportHours: z.string().optional(),
        supportEmail: z.string().optional(),
        supportPhone: z.string().optional(),
        whatsappNumber: z.string().nullable().optional(),
        supportHoursText: z.string().optional(),
        supportHoursTextAr: z.string().optional(),
        companyName: z.string().optional(),
        companyNameAr: z.string().optional(),
        copyrightText: z.string().optional(),
        copyrightTextAr: z.string().optional(),
        facebookUrl: z.string().nullable().optional(),
        twitterUrl: z.string().nullable().optional(),
        linkedinUrl: z.string().nullable().optional(),
        instagramUrl: z.string().nullable().optional(),
        metaTitle: z.string().optional(),
        metaTitleAr: z.string().optional(),
        metaDescription: z.string().nullable().optional(),
        metaDescriptionAr: z.string().nullable().optional(),
        metaKeywords: z.string().nullable().optional(),
        clientDailyImportLimit: z.number().min(0).max(100000).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      // Check if settings exist
      const existing = await db.select().from(siteSettings).limit(1);
      
      if (existing.length === 0) {
        // Insert new settings
        await db.insert(siteSettings).values(input as any);
      } else {
        // Update existing settings
        await db.update(siteSettings)
          .set(input as any)
          .where(eq(siteSettings.id, existing[0].id));
      }
      
      return { success: true };
    }),

  // ============================================================================
  // SUBSCRIPTION PLANS
  // ============================================================================

  listSubscriptionPlans: publicProcedure.query(async () => {
    const db = await getDb();
    return await db.select().from(subscriptionPlans).orderBy(subscriptionPlans.displayOrder);
  }),

  getSubscriptionPlan: superAdminProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const plans = await db.select()
        .from(subscriptionPlans)
        .where(eq(subscriptionPlans.id, input.id))
        .limit(1);
      return plans[0] || null;
    }),

  createSubscriptionPlan: superAdminProcedure
    .input(
      z.object({
        name: z.string(),
        nameAr: z.string(),
        description: z.string().optional(),
        descriptionAr: z.string().optional(),
        price: z.number(),
        currency: z.string().default("USD"),
        billingPeriod: z.enum(["monthly", "semi_annual", "yearly"]).default("monthly"),
        features: z.array(z.string()),
        featuresAr: z.array(z.string()),
        maxCards: z.number().optional(),
        maxNasDevices: z.number().optional(),
        maxResellers: z.number().optional(),
        isPopular: z.boolean().default(false),
        displayOrder: z.number().default(0),
        isActive: z.boolean().default(true),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      const result = await db.insert(subscriptionPlans).values({
        ...input,
        features: input.features as any,
        featuresAr: input.featuresAr as any,
      });
      return { id: Number(result.insertId), success: true };
    }),

  updateSubscriptionPlan: superAdminProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().optional(),
        nameAr: z.string().optional(),
        description: z.string().optional(),
        descriptionAr: z.string().optional(),
        price: z.number().optional(),
        currency: z.string().optional(),
        billingPeriod: z.enum(["monthly", "semi_annual", "yearly"]).optional(),
        features: z.array(z.string()).optional(),
        featuresAr: z.array(z.string()).optional(),
        maxCards: z.number().optional(),
        maxNasDevices: z.number().optional(),
        maxResellers: z.number().optional(),
        isPopular: z.boolean().optional(),
        displayOrder: z.number().optional(),
        isActive: z.boolean().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      const { id, ...updates } = input;
      
      // Convert arrays to JSON if provided
      const updateData: any = { ...updates };
      if (updates.features) {
        updateData.features = updates.features as any;
      }
      if (updates.featuresAr) {
        updateData.featuresAr = updates.featuresAr as any;
      }
      
      await db.update(subscriptionPlans)
        .set(updateData)
        .where(eq(subscriptionPlans.id, id));
      
      return { success: true };
    }),

  deleteSubscriptionPlan: superAdminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.delete(subscriptionPlans).where(eq(subscriptionPlans.id, input.id));
      return { success: true };
    }),

  // ============================================================================
  // VERIFICATION SETTINGS (Registration method: email / sms / both)
  // ============================================================================
  getVerificationSettings: publicProcedure.query(async () => {
    const db = await getDb();
    const rows = await db
      .select()
      .from(systemSettings)
      .where(
        // fetch all verification-related keys
        eq(systemSettings.key, "email_verification_enabled")
      );
    // Fetch all three keys individually
    const allRows = await db
      .select()
      .from(systemSettings);
    const map: Record<string, string> = {};
    for (const r of allRows) map[r.key] = r.value ?? "";
    return {
      emailEnabled: map["email_verification_enabled"] !== "false",  // default true
      smsEnabled: map["sms_verification_enabled"] === "true",       // default false
      verificationMethod: (map["verification_method"] as "email" | "sms" | "both") || "email",
    };
  }),

  updateVerificationSettings: superAdminProcedure
    .input(
      z.object({
        emailEnabled: z.boolean(),
        smsEnabled: z.boolean(),
        verificationMethod: z.enum(["email", "sms", "both"]),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      const upsert = async (key: string, value: string, description: string) => {
        await db
          .insert(systemSettings)
          .values({ key, value, description })
          .onDuplicateKeyUpdate({ set: { value } });
      };
      await upsert(
        "email_verification_enabled",
        String(input.emailEnabled),
        "هل يتم إرسال كود التحقق عبر البريد الإلكتروني عند التسجيل"
      );
      await upsert(
        "sms_verification_enabled",
        String(input.smsEnabled),
        "هل يتم إرسال كود التحقق عبر SMS عند التسجيل"
      );
      await upsert(
        "verification_method",
        input.verificationMethod,
        "طريقة إرسال كود التحقق: email / sms / both"
      );
      return { success: true };
    }),

  // ============================================================================
  // PAYMENT SETTINGS
  // ============================================================================
  getPaymentSettings: publicProcedure.query(async () => {
    const db = await getDb();
    const allRows = await db.select().from(systemSettings);
    const map: Record<string, string> = {};
    for (const r of allRows) map[r.key] = r.value ?? "";
    return {
      bankEnabled: map["payment_bank_enabled"] === "true",
      bankAccounts: (() => {
        try { return JSON.parse(map["payment_bank_accounts"] || "[]"); } catch { return []; }
      })(),
      paypalEnabled: map["payment_paypal_enabled"] === "true",
      paypalEmail: map["payment_paypal_email"] || "",
      paypalLink: map["payment_paypal_link"] || "",
      palpayEnabled: map["payment_palpay_enabled"] === "true",
      palpayPhone: map["payment_palpay_phone"] || "",
      palpayAccountName: map["payment_palpay_account_name"] || "",
      palpayNote: map["payment_palpay_note"] || "",
      palpayQr: map["payment_palpay_qr"] || "",
    };
  }),

  updatePaymentSettings: superAdminProcedure
    .input(
      z.object({
        bankEnabled: z.boolean(),
        bankAccounts: z.array(
          z.object({
            id: z.string(),
            bankName: z.string(),
            accountNumber: z.string(),
            iban: z.string(),
            phone: z.string(),
            accountHolder: z.string(),
            qrCode: z.string().optional(),
          })
        ),
        paypalEnabled: z.boolean(),
        paypalEmail: z.string(),
        paypalLink: z.string(),
        palpayEnabled: z.boolean(),
        palpayPhone: z.string(),
        palpayAccountName: z.string(),
        palpayNote: z.string(),
        palpayQr: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      const upsert = async (key: string, value: string, description: string) => {
        await db
          .insert(systemSettings)
          .values({ key, value, description })
          .onDuplicateKeyUpdate({ set: { value } });
      };
      await upsert("payment_bank_enabled", String(input.bankEnabled), "تفعيل التحويل البنكي");
      await upsert("payment_bank_accounts", JSON.stringify(input.bankAccounts), "قائمة الحسابات البنكية JSON");
      await upsert("payment_paypal_enabled", String(input.paypalEnabled), "تفعيل PayPal");
      await upsert("payment_paypal_email", input.paypalEmail, "بريد PayPal");
      await upsert("payment_paypal_link", input.paypalLink, "رابط الدفع عبر PayPal");
      await upsert("payment_palpay_enabled", String(input.palpayEnabled), "تفعيل PalPay");
      await upsert("payment_palpay_phone", input.palpayPhone, "رقم هاتف PalPay");
      await upsert("payment_palpay_account_name", input.palpayAccountName, "اسم صاحب حساب PalPay");
      await upsert("payment_palpay_note", input.palpayNote, "ملاحظة PalPay");
      await upsert("payment_palpay_qr", input.palpayQr || "", "QR Code لـ PalPay");
      return { success: true };
    }),
});
