import { NextRequest, NextResponse } from "next/server";
import { store } from "../mockData";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const fileName = searchParams.get("fileName");
  const fileSizeStr = searchParams.get("fileSize");
  const contentType = searchParams.get("contentType") || "application/octet-stream";
  const userId = searchParams.get("userId") || "user-demo-1";

  if (!fileName || !fileSizeStr) {
    return NextResponse.json(
      { error: "fileName and fileSize query parameters are required" },
      { status: 400 }
    );
  }

  const fileSize = parseInt(fileSizeStr, 10);
  const MAX_FILE_BYTES = 20971520; // 20 MB
  const MAX_STORAGE_BYTES = 104857600; // 100 MB

  if (fileSize > MAX_FILE_BYTES) {
    return NextResponse.json(
      { error: "File size exceeds maximum allowed file limit of 20 MB" },
      { status: 400 }
    );
  }

  if (!store.quotas[userId]) {
    store.quotas[userId] = {
      userId,
      totalStorageBytes: 0,
      maxAllowedBytes: MAX_STORAGE_BYTES,
      usedMb: 0,
      maxMb: 100,
      usagePercentage: 0,
      documentCount: 0,
    };
  }

  const currentQuota = store.quotas[userId];
  if (currentQuota.totalStorageBytes + fileSize > currentQuota.maxAllowedBytes) {
    return NextResponse.json(
      { error: "User storage quota exceeded (100 MB max allowed)" },
      { status: 400 }
    );
  }

  const docId = `doc-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const s3Key = `uploads/${userId}/${docId}/${fileName}`;

  // In mock mode, we point the upload URL to our local mock receiver
  const uploadUrl = `/api/mock-upload?key=${encodeURIComponent(s3Key)}&docId=${docId}&userId=${userId}&size=${fileSize}&name=${encodeURIComponent(fileName)}`;

  // Create pending doc in store
  if (!store.documents[userId]) {
    store.documents[userId] = [];
  }

  const newDoc = {
    doc_id: docId,
    user_id: userId,
    file_name: fileName,
    s3_key: s3Key,
    file_size_bytes: fileSize,
    content_type: contentType,
    upload_timestamp: new Date().toISOString(),
    processing_status: "PENDING_UPLOAD" as const,
    extracted_text: "",
    parsed_metadata: { emails: [], phones: [], keywords: [] },
  };

  store.documents[userId].unshift(newDoc);

  return NextResponse.json({
    uploadUrl,
    s3Key,
    docId,
    userId,
    fileName,
    fileSizeBytes: fileSize,
    contentType,
    expiresIn: 900,
  });
}
