import { protectedProcedure, publicProcedure, superAdminProcedure, resellerProcedure, clientProcedure, activeSubscriptionProcedure, router } from "../_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import * as db from "../db";
import * as walletDb from "../db/wallet";
import * as planDb from "../db/plans";
import * as nasDb from "../db/nas";
import * as cardDb from "../db/vouchers";
import * as invoiceDb from "../db/invoices";
import * as subscriptionDb from "../db/subscriptions";
import * as notificationDb from "../db/notifications";
import * as templateDb from "../db/cardTemplates";
import * as radiusSubscribers from "../db/radiusSubscribers";
import * as vpnApi from "../services/vpnApiService";
import * as accountingService from "../services/accountingService";
import * as sessionMonitor from "../services/sessionMonitor";
import * as coaService from "../services/coaService";
import * as multiChannelNotification from "../services/multiChannelNotificationService";
import * as tweetsmsService from "../services/tweetsmsService";
import * as smsDb from "../db/sms";
import * as mikrotikApi from "../services/mikrotikApi";
import * as authService from "../services/authService";
import { storagePut } from "../storage";
import { generateCardsPDFHTML, generateCardsCSV, saveBatchPDF, saveBatchPDFWithTemplate, generateCardsPDFHTMLWithTemplate } from "../services/pdfGenerator";
import { logAudit } from "../services/auditLogService";
import { notifyOwnerEvent, notifySubscriberEvent } from "../services/notificationService";
import { getDb } from "../db";
import { radcheck, radreply, nasDevices, radiusCards, radacct, users, wallets, walletLedger, cardBatches, checkTokens, plans, notificationChannels, siteSettings, systemUpdates } from "../../drizzle/schema";
import { eq, and, isNull, sql, desc, or, count, gte, like, inArray } from "drizzle-orm";
import { getTenantContext, getEffectiveOwnerId, canSeeAllData } from "../tenant-isolation";
import * as permissionsService from "../services/permissionsService";
import { ENV } from "../_core/env";
import * as vpnIpPool from "../db/vpnIpPool";
import * as freeradiusService from "../services/freeradiusService";
import * as twoPhaseProvisioning from "../services/twoPhaseProvisioningService";
import { autoFixMissingHuntgroups } from '../v2/V2ServiceBridge';
import { generateCardsV2 } from "../db/generateCardsV2";
import { importCardsFromCsv, parseCsvCards } from "../db/importCardsFromCsv";
import { parseFileToRows, mapRowsToCards } from "../db/parseFileCards";

export const submitRequest = protectedProcedure
    .input(z.object({
      requestedAmount: z.number().min(0).max(10000), // المبلغ يُحدَّد من قِبل المدير فقط
      requestedCurrency: z.enum(['USD', 'ILS']).default('USD'),
      receiptImage: z.object({
        data: z.string(),
        filename: z.string(),
        mimeType: z.string(),
      }),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      
      const { bankTransferRequests } = await import('../../drizzle/schema');
      
      try {
        const imageBuffer = Buffer.from(input.receiptImage.data, 'base64');
        
        // Generate temporary reference number (will be replaced by admin)
        const tempRefNumber = `TEMP-${ctx.user.id}-${Date.now()}`;
        
        // Save to S3 storage
        let receiptImageUrl;
        try {
          console.log('[Bank Transfer] Saving receipt image to S3:', {
            userId: ctx.user.id,
            refNumber: tempRefNumber,
            bufferSize: imageBuffer.length,
            mimeType: input.receiptImage.mimeType
          });
          
          // Get file extension from MIME type
          const ext = input.receiptImage.mimeType.split('/')[1] || 'jpg';
          const date = new Date().toISOString().split('T')[0];
          const timestamp = Date.now();
          const filename = `bank-receipts/user-${ctx.user.id}_ref-${tempRefNumber}_${date}_${timestamp}.${ext}`;
          
          const { url } = await storagePut(
            filename,
            imageBuffer,
            input.receiptImage.mimeType
          );
          receiptImageUrl = url;
          
          console.log('[Bank Transfer] Receipt image saved to S3 successfully:', {
            url: receiptImageUrl
          });
        } catch (storageError) {
          console.error('S3 storage failed:', storageError);
          throw new TRPCError({ 
            code: 'INTERNAL_SERVER_ERROR', 
            message: `File storage failed: ${storageError instanceof Error ? storageError.message : 'Unknown error'}` 
          });
        }
        
        // Create pending request (admin will fill in the details)
        const [result] = await db.insert(bankTransferRequests).values({
          userId: ctx.user.id,
          requestedAmount: input.requestedAmount.toString(),
          requestedCurrency: input.requestedCurrency,
          transferredAmount: '0', // Will be filled by admin
          transferredCurrency: 'USD', // Will be updated by admin
          exchangeRate: '1', // Will be calculated when admin approves
          finalAmountUSD: '0', // Will be calculated when admin approves
          receiptImageUrl,
          referenceNumber: tempRefNumber, // Will be updated by admin
          ocrData: null, // No OCR data
          status: 'pending',
        });

        // إشعار Telegram فوري للمدير عند وصول طلب تحويل بنكي جديد
        try {
          const ownerUser = await db.select({ id: users.id })
            .from(users)
            .where(eq(users.role, 'owner'))
            .limit(1);
          if (ownerUser.length > 0) {
            const ownerId = ownerUser[0].id;
            await notifyOwnerEvent(ownerId, 'ownerNewPayment', {
              emoji: '💰',
              title: 'طلب شحن رصيد جديد',
              message: `العميل: ${ctx.user.name || ctx.user.username || ctx.user.email}\nالعملة: ${input.requestedCurrency}\nالحالة: بانتظار المراجعة\n\nيرجى مراجعة لوحة الإدارة والموافقة على الطلب.`,
            });
          }
        } catch (notifError) {
          // لا يفشل الطلب إذا فشل الإشعار
          console.error('[BankTransfer] Telegram notification failed:', notifError);
        }

        return {
          success: true,
          requestId: Number(result.insertId),
          message: 'Receipt uploaded successfully. Your request will be reviewed by admin.',
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        console.error('Submit request failed:', error);
        throw new TRPCError({ 
          code: 'INTERNAL_SERVER_ERROR', 
          message: error instanceof Error ? error.message : 'Failed to submit request' 
        });
      }
    });


export const getAll = protectedProcedure
    .input(z.object({
      status: z.enum(['all', 'pending', 'approved', 'rejected']).optional().default('all'),
      limit: z.number().min(1).max(100).optional().default(50),
    }))
    .query(async ({ ctx, input }) => {
      if (ctx.user.role !== 'owner' && ctx.user.role !== 'super_admin') {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }
      
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      
      const { bankTransferRequests, users } = await import('../../drizzle/schema');
      
      const conditions = input.status !== 'all' ? [eq(bankTransferRequests.status, input.status)] : [];
      const requests = await db.select().from(bankTransferRequests)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(bankTransferRequests.submittedAt))
        .limit(input.limit);
      
      const requestsWithUsers = [];
      for (const req of requests) {
        const [user] = await db.select({ id: users.id, name: users.name, email: users.email })
          .from(users).where(eq(users.id, req.userId)).limit(1);
        requestsWithUsers.push({ ...req, user: user || null });
      }
      
      return { requests: requestsWithUsers };
    });


export const getMy = protectedProcedure
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      
      const { bankTransferRequests } = await import('../../drizzle/schema');
      const requests = await db.select().from(bankTransferRequests)
        .where(eq(bankTransferRequests.userId, ctx.user.id))
        .orderBy(desc(bankTransferRequests.submittedAt));
      return { requests };
    });


export const approve = protectedProcedure
    .input(z.object({ 
      requestId: z.number(),
      transferredAmount: z.number().positive(),
      transferredCurrency: z.enum(['USD', 'ILS']),
      referenceNumber: z.string().min(1).max(100),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== 'owner' && ctx.user.role !== 'super_admin') {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }
      
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      
      const { bankTransferRequests, wallets, walletLedger } = await import('../../drizzle/schema');
      const { getExchangeRate } = await import('../services/exchangeRateService');
      
      const [request] = await db.select().from(bankTransferRequests)
        .where(eq(bankTransferRequests.id, input.requestId)).limit(1);
      if (!request || request.status !== 'pending') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid request' });
      }
      
      // Note: Reference number validation removed to allow admin flexibility
      // Admin can use any reference number they want for record-keeping
      
      // Calculate USD amount based on currency
      let exchangeRate = 1;
      let finalAmountUSD = input.transferredAmount;
      
      if (input.transferredCurrency === 'ILS') {
        try {
          exchangeRate = await getExchangeRate('ILS', 'USD');
          finalAmountUSD = Math.round(input.transferredAmount * exchangeRate * 100) / 100;
        } catch (error) {
          // Fallback rate if API fails
          exchangeRate = 0.27;
          finalAmountUSD = Math.round(input.transferredAmount * exchangeRate * 100) / 100;
        }
      }
      
      // Use deposit() to automatically settle any outstanding debt first
      const depositResult = await walletDb.deposit(
        request.userId,
        finalAmountUSD.toFixed(2),
        `Bank transfer approved (Ref: ${request.referenceNumber})`
      );

      // Also record in walletLedger for audit trail
      const [walletAfter] = await db.select().from(wallets)
        .where(eq(wallets.userId, request.userId)).limit(1);
      const currentBalance = parseFloat(walletAfter?.balance || '0') - parseFloat(depositResult.newBalance);

      await db.insert(walletLedger).values({
        userId: request.userId,
        type: 'credit',
        amount: finalAmountUSD.toFixed(2),
        balanceBefore: (parseFloat(depositResult.newBalance) - finalAmountUSD + (depositResult.debtDeducted || 0)).toFixed(2),
        balanceAfter: depositResult.newBalance,
        reason: `Bank transfer approved (Ref: ${request.referenceNumber})${
          depositResult.debtDeducted > 0 ? ` - debt settled: $${depositResult.debtDeducted.toFixed(2)}` : ''
        }`,
        reasonAr: `تمت الموافقة على التحويل البنكي (المرجع: ${request.referenceNumber})${
          depositResult.debtDeducted > 0 ? ` - تم سداد مديونية: $${depositResult.debtDeducted.toFixed(2)}` : ''
        }`,
        relatedEntityType: 'bank_transfer',
        relatedEntityId: request.id,
        performedBy: ctx.user.id,
      });
      
      await db.update(bankTransferRequests).set({
        status: 'approved',
        transferredAmount: input.transferredAmount.toString(),
        transferredCurrency: input.transferredCurrency,
        exchangeRate: exchangeRate.toString(),
        finalAmountUSD: finalAmountUSD.toString(),
        referenceNumber: input.referenceNumber,
        reviewedAt: new Date(),
        reviewedBy: ctx.user.id,
      }).where(eq(bankTransferRequests.id, input.requestId));

      // ── Create invoice + generate PDF ──────────────────────────────────────
      let invoicePdfUrl: string | undefined;
      try {
        // Get client info
        const [clientUser] = await db.select({ name: users.name, email: users.email, phone: users.phone })
          .from(users).where(eq(users.id, request.userId)).limit(1);

        // Create invoice record
        const invoiceResult = await invoiceDb.createInvoice({
          userId: request.userId,
          type: 'deposit',
          items: [{
            description: `Bank Transfer Deposit (Ref: ${input.referenceNumber})`,
            quantity: 1,
            unitPrice: finalAmountUSD.toFixed(2),
          }],
          notes: `Bank transfer approved. Reference: ${input.referenceNumber}. Amount transferred: ${input.transferredAmount} ${input.transferredCurrency}.`,
        });

        // Generate PDF
        const { generateInvoicePdf } = await import('../services/invoicePdfGenerator');
        const { storagePut } = await import('../storage');

        const pdfBuffer = await generateInvoicePdf({
          invoiceNumber: invoiceResult.invoiceNumber,
          invoiceDate: new Date(),
          dueDate: new Date(),
          clientName: clientUser?.name || clientUser?.email || `Client #${request.userId}`,
          clientEmail: clientUser?.email || undefined,
          clientPhone: clientUser?.phone || undefined,
          items: [{
            description: `Bank Transfer Deposit (Ref: ${input.referenceNumber})`,
            quantity: 1,
            unitPrice: finalAmountUSD.toFixed(2),
          }],
          subtotal: finalAmountUSD.toFixed(2),
          total: finalAmountUSD.toFixed(2),
          currency: 'USD',
          paymentMethod: 'Bank Transfer',
          paymentReference: input.referenceNumber,
          status: 'paid',
        });

        // Upload PDF to S3
        const pdfKey = `invoices/${invoiceResult.invoiceNumber}-${Date.now()}.pdf`;
        const { url: pdfUrl } = await storagePut(pdfKey, pdfBuffer, 'application/pdf');
        invoicePdfUrl = pdfUrl;

        // Update invoice with PDF url and mark as paid
        await invoiceDb.updateInvoicePdfUrl(invoiceResult.id, pdfUrl);
        await invoiceDb.updateInvoiceStatus(invoiceResult.id, 'paid');
      } catch (pdfErr) {
        // PDF generation failure should not block approval
        console.error('[BankTransfer] PDF generation failed:', pdfErr);
      }

      return { success: true, newBalance: depositResult.newBalance, debtDeducted: depositResult.debtDeducted, invoicePdfUrl };
    });


export const reject = protectedProcedure
    .input(z.object({ requestId: z.number(), reason: z.string().min(1).max(500) }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== 'owner' && ctx.user.role !== 'super_admin') {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }
      
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      
      const { bankTransferRequests } = await import('../../drizzle/schema');
      
      const [request] = await db.select().from(bankTransferRequests)
        .where(eq(bankTransferRequests.id, input.requestId)).limit(1);
      if (!request || request.status !== 'pending') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid request' });
      }
      
      await db.update(bankTransferRequests).set({
        status: 'rejected',
        reviewedAt: new Date(),
        reviewedBy: ctx.user.id,
        adminNotes: input.reason,
      }).where(eq(bankTransferRequests.id, input.requestId));
      
      return { success: true };
    });


export const adjustBalance = protectedProcedure
    .input(z.object({ 
      requestId: z.number(),
      adjustmentAmount: z.number(), // Can be positive or negative
      reason: z.string().min(1).max(500),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== 'owner' && ctx.user.role !== 'super_admin') {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }
      
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      
      const { bankTransferRequests, wallets, walletLedger } = await import('../../drizzle/schema');
      
      const [request] = await db.select().from(bankTransferRequests)
        .where(eq(bankTransferRequests.id, input.requestId)).limit(1);
      if (!request || request.status !== 'approved') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Can only adjust approved requests' });
      }
      
      const [wallet] = await db.select().from(wallets)
        .where(eq(wallets.userId, request.userId)).limit(1);
      if (!wallet) throw new TRPCError({ code: 'NOT_FOUND', message: 'Wallet not found' });
      
      const currentBalance = parseFloat(wallet.balance);
      const newBalance = currentBalance + input.adjustmentAmount;
      
      if (newBalance < 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Adjustment would result in negative balance' });
      }
      
      await db.update(wallets).set({ balance: newBalance.toFixed(2) })
        .where(eq(wallets.id, wallet.id));
      
      await db.insert(walletLedger).values({
        userId: request.userId,
        type: input.adjustmentAmount > 0 ? 'credit' : 'debit',
        amount: Math.abs(input.adjustmentAmount).toFixed(2),
        balanceBefore: currentBalance.toFixed(2),
        balanceAfter: newBalance.toFixed(2),
        reason: `Balance adjustment for bank transfer #${request.id}: ${input.reason}`,
        reasonAr: `تعديل رصيد للتحويل البنكي #${request.id}: ${input.reason}`,
        relatedEntityType: 'bank_transfer_adjustment',
        relatedEntityId: request.id,
        performedBy: ctx.user.id,
      });
      
      // Update finalAmountUSD in request to reflect the adjustment
      const oldFinalAmount = parseFloat(request.finalAmountUSD || '0');
      const newFinalAmount = oldFinalAmount + input.adjustmentAmount;
      
      await db.update(bankTransferRequests).set({
        finalAmountUSD: newFinalAmount.toFixed(2),
        adminNotes: `${request.adminNotes || ''}\n[Adjustment] ${input.reason}`,
      }).where(eq(bankTransferRequests.id, input.requestId));
      
      return { success: true, newBalance };
    });


export const deleteRequest = protectedProcedure
    .input(z.object({ requestId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== 'owner' && ctx.user.role !== 'super_admin') {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }
      
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      
      const { bankTransferRequests } = await import('../../drizzle/schema');
      
      const [request] = await db.select().from(bankTransferRequests)
        .where(eq(bankTransferRequests.id, input.requestId)).limit(1);
      if (!request) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Request not found' });
      }
      
      // Don't allow deleting approved requests (to maintain audit trail)
      if (request.status === 'approved') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot delete approved requests. Use adjustBalance instead.' });
      }
      
      // Delete the receipt image file
      if (request.receiptImageUrl) {
        try {
          const url = request.receiptImageUrl;
          if (url.startsWith('/uploads/')) {
            // Legacy local file — attempt local deletion for backward compatibility
            const { deleteReceiptImage } = await import('../services/localFileStorage');
            await deleteReceiptImage(url);
          }
          // S3 files: the storage proxy does not expose a delete API,
          // so we skip deletion (files are orphaned but not accessible without the URL).
          // This is acceptable since the DB record is removed.
        } catch (error) {
          console.error('Failed to delete receipt image:', error);
          // Continue with deletion even if file deletion fails
        }
      }
      
      // Delete the request from database
      await db.delete(bankTransferRequests)
        .where(eq(bankTransferRequests.id, input.requestId));
      
      return { success: true };
    });


export const generateReceipt = protectedProcedure
    .input(z.object({ requestId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      
      const { bankTransferRequests, users } = await import('../../drizzle/schema');
      
      const [request] = await db.select()
        .from(bankTransferRequests)
        .innerJoin(users, eq(bankTransferRequests.userId, users.id))
        .where(eq(bankTransferRequests.id, input.requestId))
        .limit(1);
      
      if (!request) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Request not found' });
      }
      
      // Only allow generating receipt for approved requests
      if (request.bank_transfer_requests.status !== 'approved') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Receipt can only be generated for approved requests' });
      }
      
      // Only allow user to generate their own receipt (or admin)
      if (ctx.user.id !== request.bank_transfer_requests.userId && 
          ctx.user.role !== 'owner' && 
          ctx.user.role !== 'super_admin') {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }
      
      // Generate PDF receipt
      const PDFDocument = (await import('pdfkit')).default;
      
      const doc = new PDFDocument({ margin: 50 });
      const chunks: Buffer[] = [];
      
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      
      await new Promise<void>((resolve, reject) => {
        doc.on('end', () => resolve());
        doc.on('error', reject);
        
        // Header
        doc.fontSize(20).text('Payment Receipt', { align: 'center' });
        doc.moveDown();
        doc.fontSize(12).text('Radius Pro - Online RADIUS Service', { align: 'center' });
        doc.moveDown(2);
        
        // Receipt Details
        doc.fontSize(14).text('Receipt Details', { underline: true });
        doc.moveDown();
        
        doc.fontSize(11);
        doc.text(`Receipt ID: #${request.bank_transfer_requests.id}`);
        doc.text(`Date: ${new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(request.bank_transfer_requests.createdAt))}`);
        doc.text(`Customer: ${request.users.name || request.users.email}`);
        doc.text(`Amount Paid: ${request.bank_transfer_requests.requestedAmount} ${request.bank_transfer_requests.requestedCurrency || 'USD'}`);
        doc.text(`Final Amount (USD): $${request.bank_transfer_requests.finalAmountUSD}`);
        doc.text(`Status: Approved`);
        doc.text(`Approved Date: ${request.bank_transfer_requests.reviewedAt ? new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(request.bank_transfer_requests.reviewedAt)) : 'N/A'}`);
        
        doc.moveDown(2);
        
        // Footer
        doc.fontSize(10).text('Thank you for your payment!', { align: 'center' });
        doc.text('This is an automatically generated receipt.', { align: 'center' });
        
        doc.end();
      });
      
      const pdfBuffer = Buffer.concat(chunks);
      const base64Pdf = pdfBuffer.toString('base64');
      
      return { 
        success: true, 
        pdfData: base64Pdf,
        filename: `receipt-${request.bank_transfer_requests.id}.pdf`
      };
    });


import { router as _router } from "../_core/trpc";
export const bankTransferRouter = _router({
  submitRequest,
  getAll,
  getMy,
  approve,
  reject,
  adjustBalance,
  deleteRequest,
  generateReceipt,
});
