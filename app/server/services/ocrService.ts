/**
 * OCR Service
 * 
 * Extracts data from bank transfer receipt images using Tesseract.js
 * Supports Arabic and English text recognition
 */

import Tesseract from 'tesseract.js';
import { fetchSafeExternalImageBuffer } from "../security/externalUrlPolicy";

export interface OCRExtractedData {
  referenceNumber: string | null;
  amount: number | null;
  currency: string | null; // ILS or USD
  date: string | null;
  rawText: string;
  confidence: number; // 0-100
}

/**
 * Extract data from bank transfer receipt image
 * @param imageSource Buffer or URL of the receipt image
 * @returns Extracted data from the receipt
 */
export async function extractReceiptData(imageSource: Buffer | string): Promise<OCRExtractedData> {
  console.log(`[OCR] Starting OCR extraction...`);
  
  try {
    // If imageSource is a string URL, download it
    let processedImage: string | Buffer = imageSource;
    
    if (typeof imageSource === 'string') {
      console.log(`[OCR] Downloading receipt image through the secure external URL policy`);
      processedImage = await fetchSafeExternalImageBuffer(imageSource);
      console.log(`[OCR] Image downloaded successfully (${processedImage.length} bytes)`);
    } else if (Buffer.isBuffer(imageSource)) {
      console.log(`[OCR] Processing image buffer (${imageSource.length} bytes)`);
      processedImage = imageSource;
    }
    
    // Run Tesseract OCR with Arabic and English support
    const result = await Tesseract.recognize(
      processedImage,
      'ara+eng', // Arabic + English
      {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            console.log(`[OCR] Progress: ${Math.round(m.progress * 100)}%`);
          }
        },
      }
    );

    const rawText = result.data.text;
    const confidence = result.data.confidence;

    console.log(`[OCR] Raw text extracted (confidence: ${confidence.toFixed(2)}%):`);
    console.log(rawText);

    // Extract reference number (8-10 digits)
    const referenceNumber = extractReferenceNumber(rawText);
    
    // Extract amount and currency
    const { amount, currency } = extractAmountAndCurrency(rawText);
    
    // Extract date
    const date = extractDate(rawText);

    const extractedData: OCRExtractedData = {
      referenceNumber,
      amount,
      currency,
      date,
      rawText,
      confidence,
    };

    console.log(`[OCR] Extracted data:`, extractedData);

    return extractedData;
  } catch (error) {
    console.error(`[OCR] Error during OCR extraction:`, error);
    throw new Error(`OCR extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Extract reference number from text
 * Looks for patterns like "الرقم المرجعي: 171860585" or "Reference: 171860585"
 */
function extractReferenceNumber(text: string): string | null {
  // Pattern 1: Arabic - "الرقم المرجعي" followed by digits
  const arabicPattern = /(?:الرقم المرجعي|المرجعي|رقم المرجع|رقم التحويل)[:\s]*(\d{8,12})/i;
  const arabicMatch = text.match(arabicPattern);
  
  if (arabicMatch && arabicMatch[1]) {
    return arabicMatch[1];
  }

  // Pattern 2: English - "Reference" or "Ref" followed by digits
  const englishPattern = /(?:reference|ref|transaction|trx)[:\s#]*(\d{8,12})/i;
  const englishMatch = text.match(englishPattern);
  
  if (englishMatch && englishMatch[1]) {
    return englishMatch[1];
  }

  // Pattern 3: Standalone 8-12 digit number (fallback)
  const standalonePattern = /\b(\d{8,12})\b/;
  const standaloneMatch = text.match(standalonePattern);
  
  if (standaloneMatch && standaloneMatch[1]) {
    return standaloneMatch[1];
  }

  return null;
}

/**
 * Extract amount and currency from text
 * Looks for patterns like "36 شيكل" or "2.86 دينار" or "4.0 دولار"
 */
function extractAmountAndCurrency(text: string): { amount: number | null; currency: string | null } {
  // Pattern 1: Amount + Currency (Arabic)
  const patterns = [
    // Shekel patterns
    /(\d+(?:\.\d{1,2})?)\s*(?:شيكل|ILS|₪)/i,
    // Dollar patterns
    /(\d+(?:\.\d{1,2})?)\s*(?:دولار|USD|\$)/i,
    // Generic amount with currency symbol
    /(?:USD|ILS|\$|₪)\s*(\d+(?:\.\d{1,2})?)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const amount = parseFloat(match[1]);
      
      // Determine currency from context
      let currency: string | null = null;
      
      if (/شيكل|ILS|₪/.test(match[0])) {
        currency = 'ILS';
      } else if (/دولار|USD|\$/.test(match[0])) {
        currency = 'USD';
      }

      return { amount, currency };
    }
  }

  // Fallback: Try to find any decimal number
  const amountPattern = /(\d+\.\d{2})/;
  const amountMatch = text.match(amountPattern);
  
  if (amountMatch && amountMatch[1]) {
    return {
      amount: parseFloat(amountMatch[1]),
      currency: null, // Unknown currency
    };
  }

  return { amount: null, currency: null };
}

/**
 * Extract date from text
 * Looks for patterns like "10/02/2026" or "2026-02-10"
 */
function extractDate(text: string): string | null {
  // Pattern 1: DD/MM/YYYY or MM/DD/YYYY
  const slashPattern = /(\d{1,2}\/\d{1,2}\/\d{4})/;
  const slashMatch = text.match(slashPattern);
  
  if (slashMatch && slashMatch[1]) {
    return slashMatch[1];
  }

  // Pattern 2: YYYY-MM-DD
  const dashPattern = /(\d{4}-\d{2}-\d{2})/;
  const dashMatch = text.match(dashPattern);
  
  if (dashMatch && dashMatch[1]) {
    return dashMatch[1];
  }

  return null;
}

/**
 * Validate extracted data
 * Returns true if the data looks valid
 */
export function validateExtractedData(data: OCRExtractedData): boolean {
  // Must have reference number
  if (!data.referenceNumber) {
    return false;
  }

  // Must have amount
  if (!data.amount || data.amount <= 0) {
    return false;
  }

  // Must have currency
  if (!data.currency || !['ILS', 'USD'].includes(data.currency)) {
    return false;
  }

  // Confidence should be at least 50%
  if (data.confidence < 50) {
    return false;
  }

  return true;
}
