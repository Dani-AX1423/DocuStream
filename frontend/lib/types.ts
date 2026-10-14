export type ProcessingStatus = "PENDING_UPLOAD" | "PROCESSING" | "PROCESSED" | "FAILED";

export interface ParsedMetadata {
  emails: string[];
  phones: string[];
  keywords: string[];
}

export interface DocumentItem {
  doc_id: string;
  user_id?: string;
  file_name: string;
  original_file_name?: string;
  s3_key: string;
  s3_bucket?: string;
  file_size_bytes: number;
  content_type?: string;
  upload_timestamp: string;
  processed_timestamp?: string;
  processing_status: ProcessingStatus;
  extracted_text: string;
  parsed_metadata: ParsedMetadata;
  downloadUrl?: string | null;
  viewUrl?: string | null;
  error_message?: string;
  block_count?: number;
}


export interface UserQuota {
  userId: string;
  totalStorageBytes: number;
  maxAllowedBytes: number;
  usedMb: number;
  maxMb: number;
  usagePercentage: number;
  documentCount: number;
}

export interface UploadUrlResponse {
  uploadUrl: string;
  s3Key: string;
  docId: string;
  userId: string;
  fileName: string;
  fileSizeBytes: number;
  contentType: string;
  expiresIn: number;
}

export interface DocumentListResponse {
  documents: DocumentItem[];
  quota: UserQuota;
  count: number;
}

export interface UploadProgress {
  file: File;
  docId?: string;
  progress: number;
  status: "requesting_url" | "uploading_s3" | "processing_textract" | "completed" | "error";
  errorMessage?: string;
}
