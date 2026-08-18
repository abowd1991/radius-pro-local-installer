import { promises as fs } from "node:fs";
import path from "node:path";
import { ENV } from "./_core/env";

type StorageConfig = { baseUrl: string; apiKey: string };

const LOCAL_STORAGE_URL_PREFIX = "/uploads/";

function useLocalStorage(): boolean {
  return process.env.LOCAL_STORAGE_ENABLED === "true";
}

function getStorageConfig(): StorageConfig {
  const baseUrl = ENV.forgeApiUrl;
  const apiKey = ENV.forgeApiKey;

  if (!baseUrl || !apiKey) {
    throw new Error(
      "Storage proxy credentials missing: set BUILT_IN_FORGE_API_URL and BUILT_IN_FORGE_API_KEY, or enable LOCAL_STORAGE_ENABLED"
    );
  }

  return { baseUrl: baseUrl.replace(/\/+$/, ""), apiKey };
}

function buildUploadUrl(baseUrl: string, relKey: string): URL {
  const url = new URL("v1/storage/upload", ensureTrailingSlash(baseUrl));
  url.searchParams.set("path", normalizeKey(relKey));
  return url;
}

async function buildDownloadUrl(baseUrl: string, relKey: string, apiKey: string): Promise<string> {
  const downloadApiUrl = new URL("v1/storage/downloadUrl", ensureTrailingSlash(baseUrl));
  downloadApiUrl.searchParams.set("path", normalizeKey(relKey));
  const response = await fetch(downloadApiUrl, {
    method: "GET",
    headers: buildAuthHeaders(apiKey),
  });
  if (!response.ok) {
    throw new Error(`Storage download URL failed: ${response.status} ${response.statusText}`);
  }
  const result = await response.json().catch(() => {
    throw new Error("Storage API returned invalid JSON response");
  });
  if (!result.url) throw new Error("Storage API did not return a URL");
  return result.url;
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function normalizeKey(relKey: string): string {
  const rawKey = relKey.replace(/\\/g, "/").replace(/^\/+/, "");
  const normalized = path.posix.normalize(rawKey);
  if (!normalized || normalized === "." || normalized.startsWith("../") || path.posix.isAbsolute(normalized)) {
    throw new Error("Invalid storage key");
  }
  return normalized;
}

function getLocalStorageDirectory(): string {
  return path.resolve(process.env.LOCAL_STORAGE_DIR || path.join(process.cwd(), "uploads"));
}

function resolveLocalStoragePath(relKey: string): { key: string; filePath: string } {
  const key = normalizeKey(relKey);
  const baseDirectory = getLocalStorageDirectory();
  const filePath = path.resolve(baseDirectory, ...key.split("/"));
  if (filePath !== baseDirectory && !filePath.startsWith(`${baseDirectory}${path.sep}`)) {
    throw new Error("Invalid storage key");
  }
  return { key, filePath };
}

function buildLocalStorageUrl(key: string): string {
  return `${LOCAL_STORAGE_URL_PREFIX}${key.split("/").map(encodeURIComponent).join("/")}`;
}

function toFormData(data: Buffer | Uint8Array | string, contentType: string, fileName: string): FormData {
  const blob = new Blob([data as any], { type: contentType });
  const form = new FormData();
  form.append("file", blob, fileName || "file");
  return form;
}

function buildAuthHeaders(apiKey: string): HeadersInit {
  return { Authorization: `Bearer ${apiKey}` };
}

async function putLocalStorageObject(relKey: string, data: Buffer | Uint8Array | string): Promise<{ key: string; url: string }> {
  const { key, filePath } = resolveLocalStoragePath(relKey);
  await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o750 });
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temporaryPath, data, { mode: 0o640 });
  await fs.rename(temporaryPath, filePath);
  return { key, url: buildLocalStorageUrl(key) };
}

export function isLocalStorageUrl(rawUrl: string): boolean {
  return rawUrl.startsWith(LOCAL_STORAGE_URL_PREFIX);
}

export async function readLocalStorageUrl(rawUrl: string): Promise<Buffer> {
  if (!isLocalStorageUrl(rawUrl)) throw new Error("Not a local storage URL");
  const rawKey = rawUrl.slice(LOCAL_STORAGE_URL_PREFIX.length).split("/").map(decodeURIComponent).join("/");
  const { filePath } = resolveLocalStoragePath(rawKey);
  return fs.readFile(filePath);
}

export async function storagePut(relKey: string, data: Buffer | Uint8Array | string, contentType = "application/octet-stream"): Promise<{ key: string; url: string }> {
  if (useLocalStorage()) return putLocalStorageObject(relKey, data);

  const { baseUrl, apiKey } = getStorageConfig();
  const key = normalizeKey(relKey);
  const uploadUrl = buildUploadUrl(baseUrl, key);
  const formData = toFormData(data, contentType, key.split("/").pop() ?? key);
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: buildAuthHeaders(apiKey),
    body: formData,
  });
  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText);
    throw new Error(`Storage upload failed (${response.status} ${response.statusText}): ${message}`);
  }
  const result = await response.json().catch(() => {
    throw new Error("Storage API returned invalid JSON response");
  });
  if (!result.url) throw new Error("Storage API did not return a URL");
  return { key, url: result.url };
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  if (useLocalStorage()) {
    const { key } = resolveLocalStoragePath(relKey);
    return { key, url: buildLocalStorageUrl(key) };
  }
  const { baseUrl, apiKey } = getStorageConfig();
  const key = normalizeKey(relKey);
  return { key, url: await buildDownloadUrl(baseUrl, key, apiKey) };
}
