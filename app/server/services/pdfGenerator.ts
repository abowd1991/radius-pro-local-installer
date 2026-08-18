import { isLocalStorageUrl, readLocalStorageUrl, storagePut } from "../storage";
import { nanoid } from "nanoid";
import QRCode from "qrcode";
import { PDFDocument, rgb, StandardFonts, PDFPage, PDFFont, PDFImage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import * as fs from "fs";
import * as path from "path";
import { getCardLayout, getQrData, normalizeFontFamily } from "./LayoutEngine";
import { fetchSafeExternalImageBuffer } from "../security/externalUrlPolicy";

// PDF Cache disabled - always generate fresh to reflect latest settings
const pdfCache = new Map<string, { url: string; key: string; timestamp: number }>();
const CACHE_TTL = 0; // Cache disabled

// Card data interface
interface CardData {
  serialNumber: string;
  username: string;
  password: string;
  planName: string;
  planNameAr?: string;
  validityDays: number;
  downloadSpeed: number;
  uploadSpeed: number;
  price: string;
}

// Template settings interface
interface TemplateSettings {
  imageUrl: string;
  cardWidth: number;
  cardHeight: number;
  // Username settings
  usernameX: number;
  usernameY: number;
  usernameFontSize: number;
  usernameFontFamily: string;
  usernameFontColor: string;
  usernameAlign: "left" | "center" | "right";
  // Password settings
  passwordX: number;
  passwordY: number;
  passwordFontSize: number;
  passwordFontFamily: string;
  passwordFontColor: string;
  passwordAlign: "left" | "center" | "right";
  // QR Code settings
  qrCodeEnabled: boolean;
  qrCodeX: number;
  qrCodeY: number;
  qrCodeSize: number;
  qrCodeDomain: string | null;
  // Print settings
  cardsPerPage: number;
  marginTop: string;
  marginHorizontal: string;
  columnsPerPage: number;
}

// Enhanced print settings interface
interface PrintSettings {
  columns: number;
  cardsPerPage: number;
  marginTop: number;
  marginBottom: number;
  marginLeft: number;
  marginRight: number;
  spacingH: number;
  spacingV: number;
}

// Batch data interface
interface BatchData {
  batchId: string;
  batchName: string;
  cards: CardData[];
  companyName?: string;
  companyLogo?: string;
  hotspotUrl?: string;
  cardsPerPage?: number;
}

// Batch data with template
interface BatchDataWithTemplate extends BatchData {
  template?: TemplateSettings;
  printSettings?: PrintSettings;
}

// A4 page dimensions in points (1 point = 1/72 inch)
const A4_WIDTH_PT = 595.28;
const A4_HEIGHT_PT = 841.89;

// Convert mm to points
const mmToPt = (mm: number): number => mm * 2.83465;

// Default print settings
const DEFAULT_PRINT_SETTINGS: PrintSettings = {
  columns: 5,
  cardsPerPage: 50,
  marginTop: 5,
  marginBottom: 5,
  marginLeft: 5,
  marginRight: 5,
  spacingH: 2,
  spacingV: 2,
};

// Parse hex color to RGB
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (result) {
    return {
      r: parseInt(result[1], 16) / 255,
      g: parseInt(result[2], 16) / 255,
      b: parseInt(result[3], 16) / 255,
    };
  }
  return { r: 0, g: 0, b: 0 };
}

// Generate QR Code as PNG buffer
async function generateQRCodeBuffer(data: string, size: number = 100): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    QRCode.toBuffer(data, {
      width: size,
      margin: 1,
      color: {
        dark: "#000000",
        light: "#ffffff",
      },
    }, (err, buffer) => {
      if (err) reject(err);
      else resolve(buffer);
    });
  });
}

// Fetch template images through the URL policy to prevent SSRF and oversized downloads.
async function fetchImageBuffer(url: string): Promise<Buffer> {
  try {
    if (isLocalStorageUrl(url)) {
      return await readLocalStorageUrl(url);
    }
    return await fetchSafeExternalImageBuffer(url);
  } catch (error) {
    console.error('[PDF] Error fetching image:', error);
    throw error;
  }
}

// Calculate card dimensions to fit A4 page
function calculateCardDimensions(settings: PrintSettings): { cardWidth: number; cardHeight: number; rows: number } {
  const availableWidthMm = 210 - settings.marginLeft - settings.marginRight;
  const availableHeightMm = 297 - settings.marginTop - settings.marginBottom;
  
  const totalHSpacing = (settings.columns - 1) * settings.spacingH;
  const cardWidthMm = (availableWidthMm - totalHSpacing) / settings.columns;
  
  const rows = Math.ceil(settings.cardsPerPage / settings.columns);
  const totalVSpacing = (rows - 1) * settings.spacingV;
  const cardHeightMm = (availableHeightMm - totalVSpacing) / rows;
  
  return { 
    cardWidth: mmToPt(cardWidthMm), 
    cardHeight: mmToPt(cardHeightMm), 
    rows 
  };
}

// Generate cache key from batch data
function generateCacheKey(batch: BatchDataWithTemplate): string {
  const templateKey = batch.template ? JSON.stringify({
    imageUrl: batch.template.imageUrl,
    usernameX: batch.template.usernameX,
    usernameY: batch.template.usernameY,
    usernameFontSize: batch.template.usernameFontSize,
    usernameFontFamily: batch.template.usernameFontFamily,
    usernameFontColor: batch.template.usernameFontColor,
    usernameAlign: batch.template.usernameAlign,
    passwordX: batch.template.passwordX,
    passwordY: batch.template.passwordY,
    passwordFontSize: batch.template.passwordFontSize,
    passwordFontFamily: batch.template.passwordFontFamily,
    passwordFontColor: batch.template.passwordFontColor,
    passwordAlign: batch.template.passwordAlign,
    qrCodeEnabled: batch.template.qrCodeEnabled,
    qrCodeX: batch.template.qrCodeX,
    qrCodeY: batch.template.qrCodeY,
    qrCodeSize: batch.template.qrCodeSize,
    qrCodeDomain: batch.template.qrCodeDomain,
  }) : 'default';
  const printKey = batch.printSettings ? JSON.stringify(batch.printSettings) : 'default';
  const cardsKey = batch.cards.map(c => `${c.username}:${c.password}`).join(',');
  return `${batch.batchId}-${templateKey}-${printKey}-${cardsKey}`.substring(0, 200);
}

// Clean expired cache entries
function cleanExpiredCache(): void {
  const now = Date.now();
  const keysToDelete: string[] = [];
  pdfCache.forEach((value, key) => {
    if (now - value.timestamp > CACHE_TTL) {
      keysToDelete.push(key);
    }
  });
  keysToDelete.forEach(key => pdfCache.delete(key));
}

// Draw a single card on PDF page - optimized to reuse embedded images
function drawCard(
  page: PDFPage,
  card: CardData,
  x: number,
  y: number,
  cardWidth: number,
  cardHeight: number,
  template: TemplateSettings | undefined,
  font: PDFFont,
  embeddedTemplateImage: PDFImage | null,
  embeddedQrImage: PDFImage | null
): void {
  // Draw template background image if available (already embedded)
  // Preserve aspect ratio (object-contain behavior)
  if (embeddedTemplateImage) {
    const imgW = embeddedTemplateImage.width;
    const imgH = embeddedTemplateImage.height;
    const scaleX = cardWidth / imgW;
    const scaleY = cardHeight / imgH;
    const scale = Math.min(scaleX, scaleY);
    const drawW = imgW * scale;
    const drawH = imgH * scale;
    const drawX = x + (cardWidth - drawW) / 2;
    const drawY = y + (cardHeight - drawH) / 2;
    page.drawImage(embeddedTemplateImage, {
      x: drawX,
      y: drawY,
      width: drawW,
      height: drawH,
    });
  } else {
    // Draw default card design
    page.drawRectangle({
      x,
      y,
      width: cardWidth,
      height: cardHeight,
      borderColor: rgb(0.8, 0.8, 0.8),
      borderWidth: 0.5,
      color: rgb(0.98, 0.98, 0.98),
    });
  }

  if (template) {
    // Use LayoutEngine for consistent calculations (same as HTML preview)
    const layout = getCardLayout(template, cardWidth, cardHeight);
    
    // Draw username
    const usernameColor = hexToRgb(layout.username.color);
    const usernameAbsX = x + layout.username.x;
    const usernameAbsY = y + cardHeight - layout.username.y; // PDF Y is bottom-up
    const usernameWidth = font.widthOfTextAtSize(card.username, layout.username.size);
    let usernameDrawX = usernameAbsX;
    if (layout.username.align === 'center') usernameDrawX = usernameAbsX - usernameWidth / 2;
    else if (layout.username.align === 'right') usernameDrawX = usernameAbsX - usernameWidth;
    
    page.drawText(card.username, {
      x: usernameDrawX,
      y: usernameAbsY - layout.username.size / 2,
      size: layout.username.size,
      font,
      color: rgb(usernameColor.r, usernameColor.g, usernameColor.b),
    });

    // Draw password
    const passwordColor = hexToRgb(layout.password.color);
    const passwordAbsX = x + layout.password.x;
    const passwordAbsY = y + cardHeight - layout.password.y;
    const passwordWidth = font.widthOfTextAtSize(card.password, layout.password.size);
    let passwordDrawX = passwordAbsX;
    if (layout.password.align === 'center') passwordDrawX = passwordAbsX - passwordWidth / 2;
    else if (layout.password.align === 'right') passwordDrawX = passwordAbsX - passwordWidth;
    
    page.drawText(card.password, {
      x: passwordDrawX,
      y: passwordAbsY - layout.password.size / 2,
      size: layout.password.size,
      font,
      color: rgb(passwordColor.r, passwordColor.g, passwordColor.b),
    });

    // Draw QR code if enabled (already embedded)
    if (layout.qr.enabled && embeddedQrImage) {
      const qrX = x + layout.qr.x - layout.qr.size / 2;
      const qrY = y + cardHeight - layout.qr.y - layout.qr.size / 2;
      page.drawImage(embeddedQrImage, {
        x: qrX,
        y: qrY,
        width: layout.qr.size,
        height: layout.qr.size,
      });
    }
  } else {
    // Default card design without template
    const fontSize = Math.min(cardWidth, cardHeight) * 0.08;
    const smallFontSize = fontSize * 0.7;
    
    // Company name
    page.drawText('RADIUS', {
      x: x + cardWidth / 2 - font.widthOfTextAtSize('RADIUS', fontSize) / 2,
      y: y + cardHeight - fontSize - 5,
      size: fontSize,
      font,
      color: rgb(0.1, 0.37, 0.48),
    });
    
    // Username label and value
    const usernameLabel = 'Username:';
    page.drawText(usernameLabel, {
      x: x + 5,
      y: y + cardHeight / 2 + smallFontSize,
      size: smallFontSize,
      font,
      color: rgb(0.4, 0.4, 0.4),
    });
    
    page.drawText(card.username, {
      x: x + 5,
      y: y + cardHeight / 2,
      size: fontSize,
      font,
      color: rgb(0, 0.4, 0.8),
    });
    
    // Password label and value
    const passwordLabel = 'Password:';
    page.drawText(passwordLabel, {
      x: x + 5,
      y: y + cardHeight / 2 - fontSize - smallFontSize,
      size: smallFontSize,
      font,
      color: rgb(0.4, 0.4, 0.4),
    });
    
    page.drawText(card.password, {
      x: x + 5,
      y: y + cardHeight / 2 - fontSize - smallFontSize * 2,
      size: fontSize,
      font,
      color: rgb(0.8, 0, 0),
    });
    
    // Serial number
    page.drawText(card.serialNumber, {
      x: x + cardWidth / 2 - font.widthOfTextAtSize(card.serialNumber, smallFontSize * 0.8) / 2,
      y: y + 5,
      size: smallFontSize * 0.8,
      font,
      color: rgb(0.5, 0.5, 0.5),
    });
  }
}

// Generate and save REAL PDF to S3 using pdf-lib
export async function saveBatchPDFWithTemplate(batch: BatchDataWithTemplate): Promise<{ pdfUrl: string; pdfKey: string }> {
  // Clean expired cache
  cleanExpiredCache();
  
  // Check cache first
  const cacheKey = generateCacheKey(batch);
  const cached = pdfCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log('[PDF] Returning cached PDF:', cached.url);
    return { pdfUrl: cached.url, pdfKey: cached.key };
  }
  
  console.log('[PDF] Starting REAL PDF generation with pdf-lib...');
  const startTime = Date.now();
  
  const template = batch.template;
  const printSettings = batch.printSettings || DEFAULT_PRINT_SETTINGS;
  const { cardWidth, cardHeight, rows } = calculateCardDimensions(printSettings);
  const cardsPerPage = printSettings.columns * rows;
  const cards = batch.cards;
  
  // Create PDF document
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  
  // Use Cairo font (supports Arabic + Latin characters)
  // subset:true reduces PDF size by 30-70% for large batches
  let font: PDFFont;
  try {
    const fontPath = path.join(__dirname, '../fonts/Cairo-Regular.ttf');
    if (fs.existsSync(fontPath)) {
      const fontBytes = fs.readFileSync(fontPath);
      font = await pdfDoc.embedFont(fontBytes, { subset: true });
      console.log('[PDF] Cairo font loaded with subset:true');
    } else {
      font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      console.warn('[PDF] Cairo font not found, falling back to Helvetica');
    }
  } catch (e) {
    font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    console.warn('[PDF] Cairo font load error, falling back to Helvetica:', e);
  }
  
  // Embed template image ONCE (not per card) for performance
  let embeddedTemplateImage: PDFImage | null = null;
  if (template?.imageUrl) {
    try {
      const buffer = await fetchImageBuffer(template.imageUrl);
      const imageBytes = new Uint8Array(buffer);
      // Detect image type
      const isPng = imageBytes[0] === 0x89 && imageBytes[1] === 0x50;
      const isJpg = imageBytes[0] === 0xFF && imageBytes[1] === 0xD8;
      
      if (isPng) {
        embeddedTemplateImage = await pdfDoc.embedPng(imageBytes);
      } else if (isJpg) {
        embeddedTemplateImage = await pdfDoc.embedJpg(imageBytes);
      } else {
        try {
          embeddedTemplateImage = await pdfDoc.embedPng(imageBytes);
        } catch {
          embeddedTemplateImage = await pdfDoc.embedJpg(imageBytes);
        }
      }
      console.log('[PDF] Template image embedded successfully (once)');
    } catch (error) {
      console.error('[PDF] Failed to embed template image:', error);
    }
  }
  
  // Pre-embed QR codes (each card has unique QR, so we embed each once)
  const embeddedQrImages: (PDFImage | null)[] = [];
  if (template?.qrCodeEnabled) {
    console.log('[PDF] Generating and embedding QR codes...');
    for (const card of cards) {
      const qrData = template.qrCodeDomain 
        ? `${template.qrCodeDomain}?u=${card.username}&p=${card.password}`
        : `${card.username}:${card.password}`;
      try {
        const qrBuffer = await generateQRCodeBuffer(qrData, template.qrCodeSize || 50);
        const embeddedQr = await pdfDoc.embedPng(qrBuffer);
        embeddedQrImages.push(embeddedQr);
      } catch (error) {
        console.error('[PDF] QR generation error:', error);
        embeddedQrImages.push(null);
      }
    }
  }
  
  // Calculate margins in points
  const marginTop = mmToPt(printSettings.marginTop);
  const marginBottom = mmToPt(printSettings.marginBottom);
  const marginLeft = mmToPt(printSettings.marginLeft);
  const marginRight = mmToPt(printSettings.marginRight);
  const spacingH = mmToPt(printSettings.spacingH);
  const spacingV = mmToPt(printSettings.spacingV);
  
  // Generate pages
  const totalPages = Math.ceil(cards.length / cardsPerPage);
  console.log(`[PDF] Generating ${totalPages} pages for ${cards.length} cards...`);
  
  for (let pageIndex = 0; pageIndex < totalPages; pageIndex++) {
    const page = pdfDoc.addPage([A4_WIDTH_PT, A4_HEIGHT_PT]);
    const pageCards = cards.slice(pageIndex * cardsPerPage, (pageIndex + 1) * cardsPerPage);
    
    for (let i = 0; i < pageCards.length; i++) {
      const card = pageCards[i];
      const col = i % printSettings.columns;
      const row = Math.floor(i / printSettings.columns);
      
      // Calculate position (PDF coordinates start from bottom-left)
      const x = marginLeft + col * (cardWidth + spacingH);
      const y = A4_HEIGHT_PT - marginTop - (row + 1) * cardHeight - row * spacingV;
      
      const embeddedQr = template?.qrCodeEnabled ? embeddedQrImages[pageIndex * cardsPerPage + i] : null;
      
      drawCard(
        page,
        card,
        x,
        y,
        cardWidth,
        cardHeight,
        template,
        font,
        embeddedTemplateImage,
        embeddedQr
      );
    }
    
    // Draw page number at bottom center
    const pageNumText = `${pageIndex + 1} / ${totalPages}`;
    const pageNumFontSize = 9;
    const pageNumWidth = font.widthOfTextAtSize(pageNumText, pageNumFontSize);
    page.drawText(pageNumText, {
      x: A4_WIDTH_PT / 2 - pageNumWidth / 2,
      y: 8, // 8pt from bottom edge
      size: pageNumFontSize,
      font,
      color: rgb(0.4, 0.4, 0.4),
    });
  }
  
  // Save PDF
  const pdfBytes = await pdfDoc.save();
  const pdfBuffer = Buffer.from(pdfBytes);
  
  const generationTime = Date.now() - startTime;
  console.log(`[PDF] PDF generated in ${generationTime}ms`);
  
  // Upload to S3 with .pdf extension
  const fileName = `cards-${batch.batchId}-${nanoid(6)}.pdf`;
  const fileKey = `pdf/${fileName}`;
  const { url } = await storagePut(fileKey, pdfBuffer, "application/pdf");
  
  console.log('[PDF] Real PDF generated and saved:', url);
  
  // Cache the result
  pdfCache.set(cacheKey, { url, key: fileKey, timestamp: Date.now() });
  
  return { pdfUrl: url, pdfKey: fileKey };
}

// Legacy save function
export async function saveBatchPDF(batch: BatchData): Promise<{ pdfUrl: string; pdfKey: string }> {
  return saveBatchPDFWithTemplate(batch);
}

// Generate CSV content
export function generateCardsCSV(cards: CardData[]): string {
  const headers = ['Serial Number', 'Username', 'Password', 'Plan', 'Validity (Days)', 'Download Speed', 'Upload Speed', 'Price'];
  const rows = cards.map(card => [
    card.serialNumber,
    card.username,
    card.password,
    card.planName,
    card.validityDays.toString(),
    card.downloadSpeed.toString(),
    card.uploadSpeed.toString(),
    card.price,
  ]);
  
  return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
}

// Save CSV to S3
export async function saveBatchCSV(batchId: string, cards: CardData[]): Promise<{ csvUrl: string; csvKey: string }> {
  const csv = generateCardsCSV(cards);
  const fileName = `batch-${batchId}-${nanoid(6)}.csv`;
  const fileKey = `csv/${fileName}`;
  
  const { url } = await storagePut(fileKey, csv, "text/csv");
  
  return { csvUrl: url, csvKey: fileKey };
}

// Legacy HTML generation for preview (kept for backward compatibility)
export async function generateCardsPDFHTMLWithTemplate(batch: BatchDataWithTemplate): Promise<string> {
  // This function is kept for preview purposes only
  // The actual PDF generation now uses pdf-lib
  const template = batch.template;
  const printSettings = batch.printSettings || DEFAULT_PRINT_SETTINGS;
  const { cardWidth, cardHeight, rows } = calculateCardDimensions(printSettings);
  
  // Convert points back to mm for HTML
  const cardWidthMm = cardWidth / 2.83465;
  const cardHeightMm = cardHeight / 2.83465;
  
  const cardsPerPage = printSettings.columns * rows;
  const cards = batch.cards;
  const pages: string[] = [];
  
  // Generate QR codes for all cards if template has QR enabled
  const qrDataUrls: string[] = [];
  if (template?.qrCodeEnabled) {
    for (const card of cards) {
      const qrData = template.qrCodeDomain 
        ? `${template.qrCodeDomain}?u=${card.username}&p=${card.password}`
        : `${card.username}:${card.password}`;
      try {
        const qrDataUrl = await QRCode.toDataURL(qrData, {
          width: template.qrCodeSize || 50,
          margin: 1,
        });
        qrDataUrls.push(qrDataUrl);
      } catch {
        qrDataUrls.push('');
      }
    }
  }
  
  // Generate pages
  for (let pageStart = 0; pageStart < cards.length; pageStart += cardsPerPage) {
    const pageCards = cards.slice(pageStart, pageStart + cardsPerPage);
    const cardHtmls: string[] = [];
    
    for (let i = 0; i < pageCards.length; i++) {
      const card = pageCards[i];
      const qrDataUrl = template?.qrCodeEnabled ? qrDataUrls[pageStart + i] : undefined;
      
      if (template) {
        // Use LayoutEngine for consistent calculations (same as PDF renderer)
        const layout = getCardLayout(template, cardWidthMm, cardHeightMm);
        const uFontFamily = normalizeFontFamily(template.usernameFontFamily);
        const pFontFamily = normalizeFontFamily(template.passwordFontFamily);
        const qrSizeMm = layout.qr.size;
        cardHtmls.push(`
          <div class="card" style="
            width: ${cardWidthMm}mm;
            height: ${cardHeightMm}mm;
            position: relative;
            background-image: url('${template.imageUrl}');
            background-size: contain;
            background-repeat: no-repeat;
            background-position: center;
            overflow: hidden;
          ">
            <div style="
              position: absolute;
              left: ${template.usernameX}%;
              top: ${template.usernameY}%;
              transform: translate(-50%, -50%);
              font-size: ${layout.username.size}pt;
              font-family: '${uFontFamily}', Cairo, Arial, sans-serif;
              color: ${layout.username.color};
              text-align: ${layout.username.align};
              white-space: nowrap;
            ">${card.username}</div>
            <div style="
              position: absolute;
              left: ${template.passwordX}%;
              top: ${template.passwordY}%;
              transform: translate(-50%, -50%);
              font-size: ${layout.password.size}pt;
              font-family: '${pFontFamily}', Cairo, Arial, sans-serif;
              color: ${layout.password.color};
              text-align: ${layout.password.align};
              white-space: nowrap;
            ">${card.password}</div>
            ${layout.qr.enabled && qrDataUrl ? `
              <img src="${qrDataUrl}" style="
                position: absolute;
                left: ${template.qrCodeX}%;
                top: ${template.qrCodeY}%;
                transform: translate(-50%, -50%);
                width: ${qrSizeMm}mm;
                height: ${qrSizeMm}mm;
                object-fit: contain;
              " />
            ` : ''}
          </div>
        `);
      } else {
        cardHtmls.push(`
          <div class="card" style="
            width: ${cardWidthMm}mm;
            height: ${cardHeightMm}mm;
            border: 0.3mm solid #ddd;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            font-family: Arial, sans-serif;
          ">
            <div style="font-weight: bold; color: #0066cc;">${card.username}</div>
            <div style="font-weight: bold; color: #cc0000;">${card.password}</div>
          </div>
        `);
      }
    }
    
    pages.push(`
      <div class="page" style="
        width: 210mm;
        height: 297mm;
        padding: ${printSettings.marginTop}mm ${printSettings.marginRight}mm ${printSettings.marginBottom}mm ${printSettings.marginLeft}mm;
        display: grid;
        grid-template-columns: repeat(${printSettings.columns}, 1fr);
        gap: ${printSettings.spacingV}mm ${printSettings.spacingH}mm;
        box-sizing: border-box;
      ">
        ${cardHtmls.join('\n')}
      </div>
    `);
  }
  
  return `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <title>بطاقات RADIUS - ${batch.batchName}</title>
  <style>
    @page { size: A4; margin: 0; }
    body { margin: 0; padding: 0; }
    .page { page-break-after: always; }
    .page:last-child { page-break-after: auto; }
  </style>
</head>
<body>
  ${pages.join('\n')}
</body>
</html>
  `;
}

export { CardData, TemplateSettings, PrintSettings, BatchData, BatchDataWithTemplate, DEFAULT_PRINT_SETTINGS };


// Legacy function for backward compatibility
export function generateCardsPDFHTML(batch: BatchData): string {
  // Simple HTML generation for legacy code
  const cards = batch.cards;
  const cardsPerPage = batch.cardsPerPage || 50;
  const pages: string[] = [];
  
  for (let pageStart = 0; pageStart < cards.length; pageStart += cardsPerPage) {
    const pageCards = cards.slice(pageStart, pageStart + cardsPerPage);
    const cardHtmls = pageCards.map(card => `
      <div class="card" style="
        width: 38mm;
        height: 25mm;
        border: 0.3mm solid #ddd;
        border-radius: 1mm;
        padding: 1mm;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        font-family: Arial, sans-serif;
        background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
      ">
        <div style="font-size: 8pt; font-weight: bold; color: #1a5f7a;">${batch.companyName || 'RADIUS'}</div>
        <div style="font-size: 7pt; color: #666;">${card.planNameAr || card.planName}</div>
        <div style="font-size: 9pt; font-weight: bold; color: #0066cc; font-family: 'Courier New', monospace;">${card.username}</div>
        <div style="font-size: 9pt; font-weight: bold; color: #cc0000; font-family: 'Courier New', monospace;">${card.password}</div>
        <div style="font-size: 5pt; color: #888;">${card.serialNumber}</div>
      </div>
    `);
    
    pages.push(`
      <div class="page" style="
        width: 210mm;
        height: 297mm;
        padding: 5mm;
        display: grid;
        grid-template-columns: repeat(5, 1fr);
        gap: 2mm;
        box-sizing: border-box;
      ">
        ${cardHtmls.join('\n')}
      </div>
    `);
  }
  
  return `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <title>بطاقات RADIUS - ${batch.batchName}</title>
  <style>
    @page { size: A4; margin: 0; }
    body { margin: 0; padding: 0; }
    .page { page-break-after: always; }
    .page:last-child { page-break-after: auto; }
  </style>
</head>
<body>
  ${pages.join('\n')}
</body>
</html>
  `;
}
