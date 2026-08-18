import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";

type Language = "ar" | "en";
type Direction = "rtl" | "ltr";

interface Translations {
  [key: string]: {
    ar: string;
    en: string;
  };
}

// Translation strings
export const translations: Translations = {
  // Common
  "app.name": { ar: "Radius Pro", en: "Radius Pro" },
  "app.tagline": { ar: "منصة إدارة خدمات الإنترنت", en: "Internet Services Management Platform" },
  "common.loading": { ar: "جاري التحميل...", en: "Loading..." },
  "common.save": { ar: "حفظ", en: "Save" },
  "common.cancel": { ar: "إلغاء", en: "Cancel" },
  "common.delete": { ar: "حذف", en: "Delete" },
  "common.edit": { ar: "تعديل", en: "Edit" },
  "common.add": { ar: "إضافة", en: "Add" },
  "common.search": { ar: "بحث", en: "Search" },
  "common.filter": { ar: "تصفية", en: "Filter" },
  "common.export": { ar: "تصدير", en: "Export" },
  "common.import": { ar: "استيراد", en: "Import" },
  "common.actions": { ar: "إجراءات", en: "Actions" },
  "common.status": { ar: "الحالة", en: "Status" },
  "common.date": { ar: "التاريخ", en: "Date" },
  "common.name": { ar: "الاسم", en: "Name" },
  "common.email": { ar: "البريد الإلكتروني", en: "Email" },
  "common.phone": { ar: "الهاتف", en: "Phone" },
  "common.active": { ar: "نشط", en: "Active" },
  "common.inactive": { ar: "غير نشط", en: "Inactive" },
  "common.suspended": { ar: "موقوف", en: "Suspended" },
  "common.all": { ar: "الكل", en: "All" },
  "common.yes": { ar: "نعم", en: "Yes" },
  "common.no": { ar: "لا", en: "No" },
  "common.confirm": { ar: "تأكيد", en: "Confirm" },
  "common.back": { ar: "رجوع", en: "Back" },
  "common.next": { ar: "التالي", en: "Next" },
  "common.previous": { ar: "السابق", en: "Previous" },
  "common.submit": { ar: "إرسال", en: "Submit" },
  "common.close": { ar: "إغلاق", en: "Close" },
  "common.view": { ar: "عرض", en: "View" },
  "common.details": { ar: "التفاصيل", en: "Details" },
  "common.total": { ar: "المجموع", en: "Total" },
  "common.amount": { ar: "المبلغ", en: "Amount" },
  "common.price": { ar: "السعر", en: "Price" },
  "common.quantity": { ar: "الكمية", en: "Quantity" },
  "common.description": { ar: "الوصف", en: "Description" },
  "common.notes": { ar: "ملاحظات", en: "Notes" },
  "common.created_at": { ar: "تاريخ الإنشاء", en: "Created At" },
  "common.updated_at": { ar: "تاريخ التحديث", en: "Updated At" },
  
  // Auth
  "auth.login": { ar: "تسجيل الدخول", en: "Login" },
  "auth.logout": { ar: "تسجيل الخروج", en: "Logout" },
  "auth.profile": { ar: "الملف الشخصي", en: "Profile" },
  "auth.settings": { ar: "الإعدادات", en: "Settings" },
  
  // Navigation
  "nav.dashboard": { ar: "لوحة التحكم", en: "Dashboard" },
  "nav.users": { ar: "المستخدمين", en: "Users" },
  "nav.resellers": { ar: "الموزعين", en: "Resellers" },
  "nav.clients": { ar: "العملاء", en: "Clients" },
  "nav.plans": { ar: "الخطط", en: "Plans" },
  "nav.nas": { ar: "أجهزة NAS", en: "NAS Devices" },
  "nav.vouchers": { ar: "الكروت", en: "Vouchers" },
  "nav.invoices": { ar: "الفواتير", en: "Invoices" },
  "nav.subscriptions": { ar: "الاشتراكات", en: "Subscriptions" },
  "nav.sessions": { ar: "الجلسات", en: "Sessions" },
  "nav.wallet": { ar: "المحفظة", en: "Wallet" },
  "nav.support": { ar: "الدعم الفني", en: "Support" },
  "nav.reports": { ar: "التقارير", en: "Reports" },
  "nav.settings": { ar: "الإعدادات", en: "Settings" },
  "nav.notifications": { ar: "الإشعارات", en: "Notifications" },
  "nav.mikrotikSetup": { ar: "اتصال ميكروتك", en: "MikroTik Setup" },
  
  // Dashboard
  "dashboard.welcome": { ar: "مرحباً", en: "Welcome" },
  "dashboard.total_users": { ar: "إجمالي المستخدمين", en: "Total Users" },
  "dashboard.total_resellers": { ar: "إجمالي الموزعين", en: "Total Resellers" },
  "dashboard.total_clients": { ar: "إجمالي العملاء", en: "Total Clients" },
  "dashboard.active_subscriptions": { ar: "الاشتراكات النشطة", en: "Active Subscriptions" },
  "dashboard.total_revenue": { ar: "إجمالي الإيرادات", en: "Total Revenue" },
  "dashboard.pending_invoices": { ar: "الفواتير المعلقة", en: "Pending Invoices" },
  "dashboard.active_sessions": { ar: "الجلسات النشطة", en: "Active Sessions" },
  "dashboard.open_tickets": { ar: "التذاكر المفتوحة", en: "Open Tickets" },
  "dashboard.wallet_balance": { ar: "رصيد المحفظة", en: "Wallet Balance" },
  "dashboard.total_vouchers": { ar: "إجمالي الكروت", en: "Total Vouchers" },
  "dashboard.used_vouchers": { ar: "الكروت المستخدمة", en: "Used Vouchers" },
  "dashboard.data_used": { ar: "البيانات المستخدمة", en: "Data Used" },
  
  // Plans
  "plans.title": { ar: "خطط الإنترنت", en: "Internet Plans" },
  "plans.add_plan": { ar: "إضافة خطة", en: "Add Plan" },
  "plans.edit_plan": { ar: "تعديل الخطة", en: "Edit Plan" },
  "plans.download_speed": { ar: "سرعة التحميل", en: "Download Speed" },
  "plans.upload_speed": { ar: "سرعة الرفع", en: "Upload Speed" },
  "plans.data_limit": { ar: "حد البيانات", en: "Data Limit" },
  "plans.duration": { ar: "المدة", en: "Duration" },
  "plans.days": { ar: "يوم", en: "Days" },
  "plans.unlimited": { ar: "غير محدود", en: "Unlimited" },
  "plans.reseller_price": { ar: "سعر الموزع", en: "Reseller Price" },
  
  // NAS Devices
  "nas.title": { ar: "أجهزة MikroTik", en: "MikroTik Devices" },
  "nas.add_device": { ar: "إضافة جهاز", en: "Add Device" },
  "nas.ip_address": { ar: "عنوان IP", en: "IP Address" },
  "nas.secret": { ar: "كلمة السر", en: "Secret" },
  "nas.type": { ar: "النوع", en: "Type" },
  "nas.location": { ar: "الموقع", en: "Location" },
  "nas.last_seen": { ar: "آخر ظهور", en: "Last Seen" },
  
  // Vouchers
  "vouchers.title": { ar: "الكروت", en: "Vouchers" },
  "vouchers.generate": { ar: "إنشاء كروت", en: "Generate Vouchers" },
  "vouchers.code": { ar: "الكود", en: "Code" },
  "vouchers.plan": { ar: "الخطة", en: "Plan" },
  "vouchers.batch": { ar: "الدفعة", en: "Batch" },
  "vouchers.unused": { ar: "غير مستخدم", en: "Unused" },
  "vouchers.used": { ar: "مستخدم", en: "Used" },
  "vouchers.expired": { ar: "منتهي", en: "Expired" },
  "vouchers.redeem": { ar: "استخدام الكرت", en: "Redeem Voucher" },
  "vouchers.enter_code": { ar: "أدخل كود الكرت", en: "Enter voucher code" },
  "vouchers.download_pdf": { ar: "تحميل PDF", en: "Download PDF" },
  
  // Invoices
  "invoices.title": { ar: "الفواتير", en: "Invoices" },
  "invoices.create": { ar: "إنشاء فاتورة", en: "Create Invoice" },
  "invoices.number": { ar: "رقم الفاتورة", en: "Invoice Number" },
  "invoices.due_date": { ar: "تاريخ الاستحقاق", en: "Due Date" },
  "invoices.paid": { ar: "مدفوعة", en: "Paid" },
  "invoices.pending": { ar: "معلقة", en: "Pending" },
  "invoices.cancelled": { ar: "ملغية", en: "Cancelled" },
  "invoices.pay_now": { ar: "ادفع الآن", en: "Pay Now" },
  "invoices.download": { ar: "تحميل الفاتورة", en: "Download Invoice" },
  
  // Wallet
  "wallet.title": { ar: "المحفظة", en: "Wallet" },
  "wallet.balance": { ar: "الرصيد", en: "Balance" },
  "wallet.deposit": { ar: "إيداع", en: "Deposit" },
  "wallet.withdraw": { ar: "سحب", en: "Withdraw" },
  "wallet.transactions": { ar: "المعاملات", en: "Transactions" },
  "wallet.add_funds": { ar: "إضافة رصيد", en: "Add Funds" },
  
  // Support
  "support.title": { ar: "الدعم الفني", en: "Technical Support" },
  "support.new_ticket": { ar: "تذكرة جديدة", en: "New Ticket" },
  "support.subject": { ar: "الموضوع", en: "Subject" },
  "support.message": { ar: "الرسالة", en: "Message" },
  "support.priority": { ar: "الأولوية", en: "Priority" },
  "support.low": { ar: "منخفضة", en: "Low" },
  "support.medium": { ar: "متوسطة", en: "Medium" },
  "support.high": { ar: "عالية", en: "High" },
  "support.urgent": { ar: "عاجلة", en: "Urgent" },
  "support.open": { ar: "مفتوحة", en: "Open" },
  "support.in_progress": { ar: "قيد المعالجة", en: "In Progress" },
  "support.resolved": { ar: "تم الحل", en: "Resolved" },
  "support.closed": { ar: "مغلقة", en: "Closed" },
  
  // Subscriptions
  "subscriptions.title": { ar: "الاشتراكات", en: "Subscriptions" },
  "subscriptions.username": { ar: "اسم المستخدم", en: "Username" },
  "subscriptions.password": { ar: "كلمة المرور", en: "Password" },
  "subscriptions.start_date": { ar: "تاريخ البدء", en: "Start Date" },
  "subscriptions.expiry_date": { ar: "تاريخ الانتهاء", en: "Expiry Date" },
  "subscriptions.renew": { ar: "تجديد", en: "Renew" },
  "subscriptions.suspend": { ar: "إيقاف", en: "Suspend" },
  "subscriptions.activate": { ar: "تفعيل", en: "Activate" },
  
  // Sessions
  "sessions.title": { ar: "الجلسات النشطة", en: "Active Sessions" },
  "sessions.ip_address": { ar: "عنوان IP", en: "IP Address" },
  "sessions.mac_address": { ar: "عنوان MAC", en: "MAC Address" },
  "sessions.start_time": { ar: "وقت البدء", en: "Start Time" },
  "sessions.duration": { ar: "المدة", en: "Duration" },
  "sessions.data_in": { ar: "البيانات الواردة", en: "Data In" },
  "sessions.data_out": { ar: "البيانات الصادرة", en: "Data Out" },
  "sessions.disconnect": { ar: "قطع الاتصال", en: "Disconnect" },
  
  // Notifications
  "notifications.title": { ar: "الإشعارات", en: "Notifications" },
  "notifications.mark_read": { ar: "تحديد كمقروء", en: "Mark as Read" },
  "notifications.mark_all_read": { ar: "تحديد الكل كمقروء", en: "Mark All as Read" },
  "notifications.no_notifications": { ar: "لا توجد إشعارات", en: "No notifications" },
  
  // Errors
  "error.generic": { ar: "حدث خطأ ما", en: "Something went wrong" },
  "error.not_found": { ar: "غير موجود", en: "Not found" },
  "error.unauthorized": { ar: "غير مصرح", en: "Unauthorized" },
  "error.forbidden": { ar: "ممنوع الوصول", en: "Access forbidden" },
  "error.network": { ar: "خطأ في الشبكة", en: "Network error" },
  
  // Success messages
  "success.saved": { ar: "تم الحفظ بنجاح", en: "Saved successfully" },
  "success.deleted": { ar: "تم الحذف بنجاح", en: "Deleted successfully" },
  "success.created": { ar: "تم الإنشاء بنجاح", en: "Created successfully" },
  "success.updated": { ar: "تم التحديث بنجاح", en: "Updated successfully" },
};

interface LanguageContextType {
  language: Language;
  direction: Direction;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("language") as Language;
      return saved || "ar";
    }
    return "ar";
  });

  const direction: Direction = language === "ar" ? "rtl" : "ltr";

  useEffect(() => {
    localStorage.setItem("language", language);
    document.documentElement.dir = direction;
    document.documentElement.lang = language;
  }, [language, direction]);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
  };

  const t = (key: string): string => {
    const translation = translations[key];
    if (!translation) {
      console.warn(`Translation missing for key: ${key}`);
      return key;
    }
    return translation[language];
  };

  return (
    <LanguageContext.Provider value={{ language, direction, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}
