import axios from "axios";
import { DocumentItem, DocumentListResponse, UploadUrlResponse } from "./types";

/**
 * Default AWS API Gateway endpoint deployed via AWS SAM
 */
export const DEFAULT_API_GATEWAY_URL =
  "https://z64eg2zv9a.execute-api.us-east-1.amazonaws.com/prod";

/**
 * Dynamically resolves the base URL for API Gateway.
 * Strips trailing slashes, sanitizes malformed inputs (e.g. accidental markdown links or placeholder brackets),
 * and validates that the URL is a syntactically valid HTTP/HTTPS endpoint.
 */
export function getApiBaseUrl(): string {
  let envUrl = process.env.NEXT_PUBLIC_API_GATEWAY_URL;

  // If environment variable is missing or empty, use the deployed AWS backend endpoint
  if (!envUrl || typeof envUrl !== "string" || envUrl.trim().length === 0) {
    return DEFAULT_API_GATEWAY_URL;
  }

  let cleaned = envUrl.trim();

  // If explicitly configured for local Edge mock mode
  if (
    cleaned.toLowerCase() === "mock" ||
    cleaned.toLowerCase() === "local" ||
    cleaned.toLowerCase() === "none"
  ) {
    return "";
  }

  // Check if it contains placeholder tokens like '<your-api-id>' or 'your-api-gateway-id'
  const isPlaceholder =
    cleaned.includes("<") ||
    cleaned.includes(">") ||
    cleaned.includes("your-api-id") ||
    cleaned.includes("your-api-gateway-id") ||
    cleaned.includes("xxxxxx") ||
    cleaned.includes("example.com");

  if (isPlaceholder) {
    console.warn(
      `DocuStream: NEXT_PUBLIC_API_GATEWAY_URL "${envUrl}" appears to be a placeholder. Falling back to deployed endpoint.`
    );
    return DEFAULT_API_GATEWAY_URL;
  }

  // Handle accidental markdown link pasting: e.g. [https://...](https://...) or https://...[...](https://...)
  const markdownMatch = cleaned.match(/\((https?:\/\/[^\s)]+)\)/);
  if (markdownMatch && markdownMatch[1]) {
    cleaned = markdownMatch[1];
  } else {
    cleaned = cleaned.replace(/^\[+/, "").replace(/\]+$/, "");
  }

  cleaned = cleaned.replace(/\/+$/, "");

  // Validate syntax with WHATWG URL parser
  try {
    const parsed = new URL(cleaned);
    if (
      (parsed.protocol === "http:" || parsed.protocol === "https:") &&
      parsed.hostname &&
      !parsed.hostname.startsWith(".") &&
      parsed.hostname.includes(".")
    ) {
      return cleaned;
    }
  } catch (err) {
    console.warn(
      `DocuStream: NEXT_PUBLIC_API_GATEWAY_URL "${envUrl}" is not a valid URL. Falling back to deployed endpoint.`
    );
    return DEFAULT_API_GATEWAY_URL;
  }

  return DEFAULT_API_GATEWAY_URL;
}

export const API_BASE_URL = getApiBaseUrl();

export function isLocalMockMode(): boolean {
  return !getApiBaseUrl();
}

/**
 * Requests an S3 presigned PUT URL from API Gateway (or local Edge fallback).
 */
export async function getPresignedUploadUrl(
  fileName: string,
  fileSize: number,
  contentType: string,
  userId: string
): Promise<UploadUrlResponse> {
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}/api/upload-url`;

  const response = await axios.get<UploadUrlResponse>(url, {
    params: {
      fileName,
      fileSize,
      contentType: contentType || "application/octet-stream",
      userId,
    },
    headers: {
      "X-User-Id": userId,
    },
  });
  return response.data;
}

/**
 * Uploads a file directly to S3 using the presigned PUT URL.
 */
export async function uploadFileToS3(
  uploadUrl: string,
  file: File,
  onProgress?: (percentage: number) => void
): Promise<void> {
  const contentType = file.type || "application/octet-stream";

  // Use axios PUT directly to S3 with upload progress tracking
  await axios.put(uploadUrl, file, {
    headers: {
      "Content-Type": contentType,
    },
    onUploadProgress: (progressEvent) => {
      if (progressEvent.total && onProgress) {
        const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
        onProgress(percent);
      }
    },
  });
}

/**
 * Fetches all processed documents and storage quota for a specific user.
 */
export async function fetchDocuments(userId: string): Promise<DocumentListResponse> {
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}/api/documents`;

  const response = await axios.get<DocumentListResponse>(url, {
    params: { userId },
    headers: {
      "X-User-Id": userId,
    },
  });
  return response.data;
}

/**
 * Deletes a document by ID and restores storage quota.
 */
export async function deleteDocument(
  docId: string,
  userId: string
): Promise<{ message: string; docId: string; freedBytes: number }> {
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}/api/documents/${docId}`;

  const response = await axios.delete(url, {
    params: { userId },
    headers: {
      "X-User-Id": userId,
    },
  });
  return response.data;
}

/**
 * Polls document processing status until it is PROCESSED or FAILED.
 */
export async function pollDocumentProcessing(
  docId: string,
  userId: string,
  onStatusUpdate?: (doc: DocumentItem) => void,
  maxAttempts = 30,
  intervalMs = 2000
): Promise<DocumentItem> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
    try {
      const data = await fetchDocuments(userId);
      const targetDoc = data.documents.find((d) => d.doc_id === docId);

      if (targetDoc) {
        if (onStatusUpdate) onStatusUpdate(targetDoc);

        if (targetDoc.processing_status === "PROCESSED" || targetDoc.processing_status === "FAILED") {
          return targetDoc;
        }
      }
    } catch (err) {
      console.warn(`Polling attempt ${attempt + 1} failed:`, err);
    }
  }
  throw new Error("Document processing timed out after 60 seconds.");
}

/**
 * Helper to format bytes into readable KB / MB / GB
 */
export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}
