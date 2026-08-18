import * as XLSX from "xlsx";
import { RevenueReport, SubscribersReport, CardsReport, SessionsReport, formatDuration } from "./reportsService";

// ============================================================================
// EXCEL EXPORT
// ============================================================================

export function generateRevenueExcel(data: RevenueReport): Buffer {
  const workbook = XLSX.utils.book_new();

  // Summary sheet
  const summaryData = [
    ["تقرير الإيرادات"],
    [],
    ["إجمالي الإيرادات", data.totalRevenue],
    ["عدد المعاملات", data.totalTransactions],
    ["متوسط المعاملة", data.averageTransaction],
  ];
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
  XLSX.utils.book_append_sheet(workbook, summarySheet, "ملخص");

  // Revenue by period sheet
  const periodData = [
    ["التاريخ", "الإيرادات", "عدد المعاملات"],
    ...data.revenueByPeriod.map(r => [r.date, r.revenue, r.transactions]),
  ];
  const periodSheet = XLSX.utils.aoa_to_sheet(periodData);
  XLSX.utils.book_append_sheet(workbook, periodSheet, "الإيرادات بالفترة");

  // Revenue by client sheet
  const clientData = [
    ["العميل", "الإيرادات"],
    ...data.revenueByClient.map(c => [c.clientName, c.revenue]),
  ];
  const clientSheet = XLSX.utils.aoa_to_sheet(clientData);
  XLSX.utils.book_append_sheet(workbook, clientSheet, "الإيرادات بالعميل");

  return Buffer.from(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));
}

export function generateSubscribersExcel(data: SubscribersReport): Buffer {
  const workbook = XLSX.utils.book_new();

  // Summary sheet
  const summaryData = [
    ["تقرير المشتركين"],
    [],
    ["إجمالي المشتركين", data.totalSubscribers],
    ["المشتركين النشطين", data.activeSubscribers],
    ["المشتركين المنتهين", data.expiredSubscribers],
    ["المشتركين الموقوفين", data.suspendedSubscribers],
    ["مشتركين جدد هذه الفترة", data.newSubscribersThisPeriod],
  ];
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
  XLSX.utils.book_append_sheet(workbook, summarySheet, "ملخص");

  // Growth sheet
  const growthData = [
    ["التاريخ", "عدد المشتركين الجدد"],
    ...data.subscriberGrowth.map(g => [g.date, g.count]),
  ];
  const growthSheet = XLSX.utils.aoa_to_sheet(growthData);
  XLSX.utils.book_append_sheet(workbook, growthSheet, "نمو المشتركين");

  return Buffer.from(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));
}

export function generateCardsExcel(data: CardsReport): Buffer {
  const workbook = XLSX.utils.book_new();

  // Summary sheet
  const summaryData = [
    ["تقرير الكروت"],
    [],
    ["إجمالي الكروت", data.totalCards],
    ["كروت غير مستخدمة", data.unusedCards],
    ["كروت نشطة", data.activeCards],
    ["كروت مستخدمة", data.usedCards],
    ["كروت منتهية", data.expiredCards],
  ];
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
  XLSX.utils.book_append_sheet(workbook, summarySheet, "ملخص");

  // Best selling plans sheet
  const plansData = [
    ["الباقة", "عدد الكروت", "الإيرادات"],
    ...data.bestSellingPlans.map(p => [p.planName, p.count, p.revenue]),
  ];
  const plansSheet = XLSX.utils.aoa_to_sheet(plansData);
  XLSX.utils.book_append_sheet(workbook, plansSheet, "أكثر الباقات مبيعاً");

  // Time consumption sheet
  const timeData = [
    ["اسم المستخدم", "الباقة", "الوقت المستهلك"],
    ...data.timeConsumptionByCard.map(t => [t.username, t.planName, formatDuration(t.totalTime)]),
  ];
  const timeSheet = XLSX.utils.aoa_to_sheet(timeData);
  XLSX.utils.book_append_sheet(workbook, timeSheet, "استهلاك الوقت");

  return Buffer.from(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));
}

export function generateSessionsExcel(data: SessionsReport): Buffer {
  const workbook = XLSX.utils.book_new();

  // Summary sheet
  const summaryData = [
    ["تقرير الجلسات"],
    [],
    ["إجمالي الجلسات", data.totalSessions],
    ["جلسات نشطة", data.activeSessions],
    ["جلسات منتهية", data.completedSessions],
    ["متوسط مدة الجلسة", formatDuration(data.averageSessionDuration)],
    ["إجمالي وقت الجلسات", formatDuration(data.totalSessionTime)],
  ];
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
  XLSX.utils.book_append_sheet(workbook, summarySheet, "ملخص");

  // Sessions by day sheet
  const dayData = [
    ["التاريخ", "عدد الجلسات", "إجمالي المدة"],
    ...data.sessionsByDay.map(s => [s.date, s.count, formatDuration(s.duration)]),
  ];
  const daySheet = XLSX.utils.aoa_to_sheet(dayData);
  XLSX.utils.book_append_sheet(workbook, daySheet, "الجلسات بالتاريخ");

  // Sessions by NAS sheet
  const nasData = [
    ["جهاز NAS", "عدد الجلسات"],
    ...data.sessionsByNas.map(s => [s.nasName, s.count]),
  ];
  const nasSheet = XLSX.utils.aoa_to_sheet(nasData);
  XLSX.utils.book_append_sheet(workbook, nasSheet, "الجلسات بالجهاز");

  return Buffer.from(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));
}

// ============================================================================
// PDF EXPORT (HTML-based for Arabic support)
// ============================================================================

export function generateReportPDFHTML(
  title: string,
  dateRange: string,
  sections: { title: string; content: string }[]
): string {
  return `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap');
    
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: 'Cairo', sans-serif;
      direction: rtl;
      padding: 40px;
      background: white;
      color: #1f2937;
    }
    
    .header {
      text-align: center;
      margin-bottom: 30px;
      padding-bottom: 20px;
      border-bottom: 2px solid #10b981;
    }
    
    .header h1 {
      font-size: 28px;
      color: #10b981;
      margin-bottom: 10px;
    }
    
    .header .date-range {
      font-size: 14px;
      color: #6b7280;
    }
    
    .section {
      margin-bottom: 30px;
    }
    
    .section h2 {
      font-size: 18px;
      color: #374151;
      margin-bottom: 15px;
      padding-bottom: 8px;
      border-bottom: 1px solid #e5e7eb;
    }
    
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
    }
    
    th, td {
      padding: 12px;
      text-align: right;
      border: 1px solid #e5e7eb;
    }
    
    th {
      background: #f3f4f6;
      font-weight: 600;
    }
    
    tr:nth-child(even) {
      background: #f9fafb;
    }
    
    .stat-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 15px;
      margin-bottom: 20px;
    }
    
    .stat-card {
      background: #f9fafb;
      padding: 15px;
      border-radius: 8px;
      border: 1px solid #e5e7eb;
    }
    
    .stat-card .label {
      font-size: 12px;
      color: #6b7280;
      margin-bottom: 5px;
    }
    
    .stat-card .value {
      font-size: 24px;
      font-weight: 700;
      color: #10b981;
    }
    
    .footer {
      margin-top: 40px;
      text-align: center;
      font-size: 12px;
      color: #9ca3af;
      padding-top: 20px;
      border-top: 1px solid #e5e7eb;
    }
    
    @media print {
      body {
        padding: 20px;
      }
      .section {
        page-break-inside: avoid;
      }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>${title}</h1>
    <div class="date-range">${dateRange}</div>
  </div>
  
  ${sections.map(s => `
    <div class="section">
      <h2>${s.title}</h2>
      ${s.content}
    </div>
  `).join("")}
  
  <div class="footer">
    تم إنشاء هذا التقرير بواسطة نظام راديوس - ${new Date().toLocaleDateString("ar-EG")}
  </div>
</body>
</html>
  `;
}

export function generateRevenuePDFHTML(data: RevenueReport, dateRange: string): string {
  const summaryContent = `
    <div class="stat-grid">
      <div class="stat-card">
        <div class="label">إجمالي الإيرادات</div>
        <div class="value">$${data.totalRevenue.toFixed(2)}</div>
      </div>
      <div class="stat-card">
        <div class="label">عدد المعاملات</div>
        <div class="value">${data.totalTransactions}</div>
      </div>
      <div class="stat-card">
        <div class="label">متوسط المعاملة</div>
        <div class="value">$${data.averageTransaction.toFixed(2)}</div>
      </div>
    </div>
  `;

  const periodTable = `
    <table>
      <thead>
        <tr>
          <th>التاريخ</th>
          <th>الإيرادات</th>
          <th>عدد المعاملات</th>
        </tr>
      </thead>
      <tbody>
        ${data.revenueByPeriod.map(r => `
          <tr>
            <td>${r.date}</td>
            <td>$${r.revenue.toFixed(2)}</td>
            <td>${r.transactions}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;

  const clientTable = `
    <table>
      <thead>
        <tr>
          <th>العميل</th>
          <th>الإيرادات</th>
        </tr>
      </thead>
      <tbody>
        ${data.revenueByClient.map(c => `
          <tr>
            <td>${c.clientName}</td>
            <td>$${c.revenue.toFixed(2)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;

  return generateReportPDFHTML("تقرير الإيرادات", dateRange, [
    { title: "ملخص", content: summaryContent },
    { title: "الإيرادات بالفترة", content: periodTable },
    { title: "أعلى العملاء إيراداً", content: clientTable },
  ]);
}

export function generateCardsPDFHTML(data: CardsReport, dateRange: string): string {
  const summaryContent = `
    <div class="stat-grid">
      <div class="stat-card">
        <div class="label">إجمالي الكروت</div>
        <div class="value">${data.totalCards}</div>
      </div>
      <div class="stat-card">
        <div class="label">كروت نشطة</div>
        <div class="value">${data.activeCards}</div>
      </div>
      <div class="stat-card">
        <div class="label">كروت غير مستخدمة</div>
        <div class="value">${data.unusedCards}</div>
      </div>
      <div class="stat-card">
        <div class="label">كروت منتهية</div>
        <div class="value">${data.expiredCards}</div>
      </div>
    </div>
  `;

  const plansTable = `
    <table>
      <thead>
        <tr>
          <th>الباقة</th>
          <th>عدد الكروت</th>
          <th>الإيرادات</th>
        </tr>
      </thead>
      <tbody>
        ${data.bestSellingPlans.map(p => `
          <tr>
            <td>${p.planName}</td>
            <td>${p.count}</td>
            <td>$${p.revenue.toFixed(2)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;

  const timeTable = `
    <table>
      <thead>
        <tr>
          <th>اسم المستخدم</th>
          <th>الباقة</th>
          <th>الوقت المستهلك</th>
        </tr>
      </thead>
      <tbody>
        ${data.timeConsumptionByCard.slice(0, 20).map(t => `
          <tr>
            <td>${t.username}</td>
            <td>${t.planName}</td>
            <td>${formatDuration(t.totalTime)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;

  return generateReportPDFHTML("تقرير الكروت", dateRange, [
    { title: "ملخص", content: summaryContent },
    { title: "أكثر الباقات مبيعاً", content: plansTable },
    { title: "استهلاك الوقت", content: timeTable },
  ]);
}

export function generateSessionsPDFHTML(data: SessionsReport, dateRange: string): string {
  const summaryContent = `
    <div class="stat-grid">
      <div class="stat-card">
        <div class="label">إجمالي الجلسات</div>
        <div class="value">${data.totalSessions}</div>
      </div>
      <div class="stat-card">
        <div class="label">جلسات نشطة</div>
        <div class="value">${data.activeSessions}</div>
      </div>
      <div class="stat-card">
        <div class="label">متوسط المدة</div>
        <div class="value">${formatDuration(data.averageSessionDuration)}</div>
      </div>
      <div class="stat-card">
        <div class="label">إجمالي الوقت</div>
        <div class="value">${formatDuration(data.totalSessionTime)}</div>
      </div>
    </div>
  `;

  const dayTable = `
    <table>
      <thead>
        <tr>
          <th>التاريخ</th>
          <th>عدد الجلسات</th>
          <th>إجمالي المدة</th>
        </tr>
      </thead>
      <tbody>
        ${data.sessionsByDay.map(s => `
          <tr>
            <td>${s.date}</td>
            <td>${s.count}</td>
            <td>${formatDuration(s.duration)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;

  const nasTable = `
    <table>
      <thead>
        <tr>
          <th>جهاز NAS</th>
          <th>عدد الجلسات</th>
        </tr>
      </thead>
      <tbody>
        ${data.sessionsByNas.map(s => `
          <tr>
            <td>${s.nasName}</td>
            <td>${s.count}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;

  return generateReportPDFHTML("تقرير الجلسات", dateRange, [
    { title: "ملخص", content: summaryContent },
    { title: "الجلسات بالتاريخ", content: dayTable },
    { title: "الجلسات حسب جهاز NAS", content: nasTable },
  ]);
}
