import puppeteer from "puppeteer";

export interface InvoiceItem {
  description: string;
  quantity: number;
  unitPrice: string;
}

export interface InvoiceData {
  invoiceNumber: string;
  invoiceDate: Date;
  dueDate: Date;
  clientName: string;
  clientEmail?: string;
  clientPhone?: string;
  items: InvoiceItem[];
  subtotal: string;
  total: string;
  currency?: string;
  paymentMethod?: string;
  paymentReference?: string;
  status?: string;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("ar-SA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatMoney(amount: string): string {
  const num = parseFloat(amount);
  return `$${num.toFixed(2)}`;
}

function buildHtml(data: InvoiceData): string {
  const statusLabel = data.status === "paid" ? "مدفوعة" : data.status === "pending" ? "معلقة" : "مسودة";
  const statusColor = data.status === "paid" ? "#10b981" : data.status === "pending" ? "#f59e0b" : "#6b7280";

  const itemsRows = data.items.map((item) => `
    <tr>
      <td style="padding:10px 14px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#374151;">${item.description}</td>
      <td style="padding:10px 14px;border-bottom:1px solid #f1f5f9;text-align:center;font-size:13px;color:#374151;">${item.quantity}</td>
      <td style="padding:10px 14px;border-bottom:1px solid #f1f5f9;text-align:center;font-size:13px;color:#374151;">${formatMoney(item.unitPrice)}</td>
      <td style="padding:10px 14px;border-bottom:1px solid #f1f5f9;text-align:center;font-size:13px;font-weight:600;color:#0d9488;">${formatMoney((item.quantity * parseFloat(item.unitPrice)).toFixed(2))}</td>
    </tr>
  `).join("");

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800&display=swap');
  * { margin:0; padding:0; box-sizing:border-box; }
  body {
    font-family: 'Cairo', 'Arial', sans-serif;
    background: #ffffff;
    color: #1f2937;
    direction: rtl;
    width: 794px;
    min-height: 1123px;
    padding: 0;
  }
  .page {
    width: 794px;
    min-height: 1123px;
    display: flex;
    flex-direction: column;
    background: #fff;
  }

  /* ── Header ── */
  .header {
    background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
    padding: 28px 40px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .logo-area { display: flex; align-items: center; gap: 14px; }
  .logo-circle {
    width: 52px; height: 52px;
    background: #0d9488;
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 22px; color: #fff;
  }
  .logo-text { color: #fff; }
  .logo-text .name { font-size: 22px; font-weight: 800; letter-spacing: 0.5px; }
  .logo-text .sub { font-size: 10px; color: #94a3b8; letter-spacing: 2px; text-transform: uppercase; margin-top: 2px; }
  .header-right { text-align: left; }
  .invoice-title { font-size: 32px; font-weight: 800; color: #fff; letter-spacing: 2px; }
  .status-badge {
    display: inline-block;
    padding: 5px 18px;
    border-radius: 20px;
    font-size: 12px;
    font-weight: 700;
    color: #fff;
    margin-top: 8px;
    background: ${statusColor};
    letter-spacing: 1px;
  }

  /* ── Info Section ── */
  .info-section {
    padding: 30px 40px;
    display: flex;
    justify-content: space-between;
    border-bottom: 2px solid #f1f5f9;
  }
  .info-block { flex: 1; }
  .info-block + .info-block { margin-right: 40px; }
  .info-label {
    font-size: 9px;
    font-weight: 700;
    color: #94a3b8;
    letter-spacing: 2px;
    text-transform: uppercase;
    margin-bottom: 6px;
  }
  .info-value { font-size: 14px; font-weight: 600; color: #1f2937; line-height: 1.6; }
  .info-value.mono { font-family: 'Courier New', monospace; font-size: 15px; color: #0d9488; }
  .info-sub { font-size: 12px; color: #6b7280; margin-top: 2px; }

  /* ── Table ── */
  .table-section { padding: 0 40px; margin-top: 24px; }
  table { width: 100%; border-collapse: collapse; }
  thead tr {
    background: #1e293b;
  }
  thead th {
    padding: 11px 14px;
    text-align: center;
    font-size: 11px;
    font-weight: 700;
    color: #e2e8f0;
    letter-spacing: 1px;
    text-transform: uppercase;
  }
  thead th:first-child { text-align: right; }
  tbody tr:nth-child(even) { background: #f8fafc; }

  /* ── Totals ── */
  .totals-section {
    padding: 16px 40px;
    display: flex;
    justify-content: flex-start;
  }
  .totals-box { min-width: 260px; }
  .totals-row {
    display: flex;
    justify-content: space-between;
    padding: 6px 0;
    font-size: 13px;
    color: #6b7280;
    border-bottom: 1px solid #f1f5f9;
  }
  .totals-row.total {
    background: #0d9488;
    color: #fff;
    padding: 10px 14px;
    border-radius: 8px;
    font-size: 16px;
    font-weight: 800;
    margin-top: 8px;
    border-bottom: none;
  }
  .totals-row.total span { color: #fff; }

  /* ── Payment Info ── */
  .payment-section {
    padding: 16px 40px;
    margin-top: 8px;
  }
  .payment-title {
    font-size: 10px;
    font-weight: 700;
    color: #94a3b8;
    letter-spacing: 2px;
    text-transform: uppercase;
    margin-bottom: 10px;
  }
  .payment-grid { display: flex; gap: 40px; }
  .payment-item label { font-size: 11px; color: #9ca3af; display: block; margin-bottom: 3px; }
  .payment-item span { font-size: 13px; font-weight: 600; color: #374151; }

  /* ── Footer ── */
  .footer {
    margin-top: auto;
    background: #0f172a;
    padding: 20px 40px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .footer-greeting { color: #e2e8f0; font-size: 13px; font-weight: 600; }
  .footer-brand { color: #0d9488; font-size: 13px; font-weight: 700; }
  .footer-sub { color: #64748b; font-size: 10px; margin-top: 2px; }
</style>
</head>
<body>
<div class="page">

  <!-- Header -->
  <div class="header">
    <div class="logo-area">
      <div class="logo-circle">📡</div>
      <div class="logo-text">
        <div class="name">Radius Pro</div>
        <div class="sub">Network Management</div>
      </div>
    </div>
    <div class="header-right">
      <div class="invoice-title">INVOICE</div>
      <div><span class="status-badge">${statusLabel}</span></div>
    </div>
  </div>

  <!-- Info Section -->
  <div class="info-section">
    <div class="info-block">
      <div class="info-label">رقم الفاتورة</div>
      <div class="info-value mono">${data.invoiceNumber}</div>
      <div style="margin-top:16px;">
        <div class="info-label">تاريخ الفاتورة</div>
        <div class="info-value">${formatDate(data.invoiceDate)}</div>
      </div>
      <div style="margin-top:16px;">
        <div class="info-label">تاريخ الاستحقاق</div>
        <div class="info-value">${formatDate(data.dueDate)}</div>
      </div>
    </div>
    <div class="info-block">
      <div class="info-label">فاتورة إلى</div>
      <div class="info-value">${data.clientName}</div>
      ${data.clientEmail ? `<div class="info-sub">${data.clientEmail}</div>` : ""}
      ${data.clientPhone ? `<div class="info-sub">${data.clientPhone}</div>` : ""}
    </div>
    <div class="info-block">
      <div class="info-label">من</div>
      <div class="info-value">Radius Pro</div>
      <div class="info-sub">Network Management</div>
      <div class="info-sub">support@radius-pro.com</div>
    </div>
  </div>

  <!-- Items Table -->
  <div class="table-section">
    <table>
      <thead>
        <tr>
          <th style="text-align:right;">الوصف</th>
          <th>الكمية</th>
          <th>سعر الوحدة</th>
          <th>الإجمالي</th>
        </tr>
      </thead>
      <tbody>
        ${itemsRows}
      </tbody>
    </table>
  </div>

  <!-- Totals -->
  <div class="totals-section">
    <div class="totals-box">
      <div class="totals-row">
        <span>المجموع الفرعي</span>
        <span>${formatMoney(data.subtotal)}</span>
      </div>
      <div class="totals-row total">
        <span>الإجمالي</span>
        <span>${formatMoney(data.total)}</span>
      </div>
    </div>
  </div>

  <!-- Payment Info -->
  ${data.paymentMethod ? `
  <div class="payment-section">
    <div class="payment-title">معلومات الدفع</div>
    <div class="payment-grid">
      <div class="payment-item">
        <label>طريقة الدفع</label>
        <span>${data.paymentMethod === "Bank Transfer" ? "تحويل بنكي" : data.paymentMethod}</span>
      </div>
      ${data.paymentReference ? `
      <div class="payment-item">
        <label>رقم المرجع</label>
        <span>${data.paymentReference}</span>
      </div>` : ""}
    </div>
  </div>` : ""}

  <!-- Footer -->
  <div class="footer">
    <div>
      <div class="footer-greeting">تحياتي، المدير عبد الرحمن العمراني</div>
      <div class="footer-sub">شكراً لثقتكم بخدماتنا</div>
    </div>
    <div style="text-align:left;">
      <div class="footer-brand">Radius Pro</div>
      <div class="footer-sub">© ${new Date().getFullYear()} جميع الحقوق محفوظة</div>
    </div>
  </div>

</div>
</body>
</html>`;
}

export async function generateInvoicePdf(data: InvoiceData): Promise<Buffer> {
  const html = buildHtml(data);

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: "/usr/bin/chromium",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--no-first-run",
      "--no-zygote",
      "--single-process",
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load", timeout: 30000 });

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
      pageRanges: "1",
    });

    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close();
  }
}
