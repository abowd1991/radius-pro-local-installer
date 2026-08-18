import { promises as fs } from 'fs';
import path from 'path';

/**
 * Local file storage service for bank transfer receipts
 * Stores files in uploads/bank-receipts/ directory with organized naming
 */

const UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'bank-receipts');
const LOGOS_DIR = path.join(process.cwd(), 'uploads', 'store-logos');

/**
 * Initialize storage directory
 */
export async function initStorage(): Promise<void> {
  try {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
  } catch (error) {
    console.error('Failed to create upload directory:', error);
    throw new Error('Storage initialization failed');
  }
}

/**
 * Save receipt image to local storage
 * @param userId - User ID
 * @param referenceNumber - Bank reference number
 * @param imageBuffer - Image data as Buffer
 * @param mimeType - Image MIME type (e.g., image/jpeg)
 * @returns Object with filePath and publicUrl
 */
export async function saveReceiptImage(
  userId: number,
  referenceNumber: string,
  imageBuffer: Buffer,
  mimeType: string
): Promise<{ filePath: string; publicUrl: string }> {
  // Ensure storage directory exists
  await initStorage();
  
  // Get file extension from MIME type
  const ext = mimeType.split('/')[1] || 'jpg';
  
  // Create organized filename: user-{userId}_ref-{refNumber}_{date}.{ext}
  const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const timestamp = Date.now();
  const filename = `user-${userId}_ref-${referenceNumber}_${date}_${timestamp}.${ext}`;
  
  const filePath = path.join(UPLOAD_DIR, filename);
  
  // Save file
  await fs.writeFile(filePath, imageBuffer);
  
  // Generate public URL (served by Express static middleware)
  const publicUrl = `/uploads/bank-receipts/${filename}`;
  
  return { filePath, publicUrl };
}

/**
 * Get receipt image file path
 * @param publicUrl - Public URL of the image
 * @returns Full file path
 */
export function getReceiptImagePath(publicUrl: string): string {
  const filename = path.basename(publicUrl);
  return path.join(UPLOAD_DIR, filename);
}

/**
 * Delete receipt image
 * @param publicUrl - Public URL of the image
 */
export async function deleteReceiptImage(publicUrl: string): Promise<void> {
  const filePath = getReceiptImagePath(publicUrl);
  try {
    await fs.unlink(filePath);
  } catch (error) {
    console.error('Failed to delete receipt image:', error);
    // Don't throw - file might already be deleted
  }
}

/**
 * Save store logo to local storage
 * @param ownerId - Owner ID
 * @param imageBuffer - Image data as Buffer
 * @param mimeType - Image MIME type
 * @returns Public URL of the saved logo
 */
export async function saveStoreLogo(
  ownerId: number,
  imageBuffer: Buffer,
  mimeType: string
): Promise<string> {
  await fs.mkdir(LOGOS_DIR, { recursive: true });
  const ext = mimeType.split('/')[1] || 'png';
  const filename = `logo-${ownerId}-${Date.now()}.${ext}`;
  const filePath = path.join(LOGOS_DIR, filename);
  await fs.writeFile(filePath, imageBuffer);
  return `/uploads/store-logos/${filename}`;
}
