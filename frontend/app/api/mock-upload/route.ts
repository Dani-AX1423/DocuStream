import { NextRequest, NextResponse } from "next/server";
import { store } from "../mockData";

export async function PUT(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const docId = searchParams.get("docId");
  const userId = searchParams.get("userId") || "user-demo-1";
  const fileName = searchParams.get("name") || "document.pdf";
  const fileSize = parseInt(searchParams.get("size") || "1048576", 10);

  if (!docId) {
    return NextResponse.json({ error: "docId parameter required" }, { status: 400 });
  }

  // Read upload buffer to simulate text extraction
  const arrayBuffer = await request.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const textContent = buffer.toString("utf-8");

  // Simulate AWS Textract and Regex parsing
  const emails = Array.from(
    new Set((textContent.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || []))
  );
  const phones = Array.from(
    new Set((textContent.match(/\+?\d{1,4}?[-.\s]?\(?\d{1,3}?\)?[-.\s]?\d{3,4}[-.\s]?\d{4}/g) || []))
  );

  // If no email/phone was found in binary (e.g. raw PDF bytes), synthesize plausible metadata
  if (emails.length === 0) {
    emails.push("contact@" + fileName.toLowerCase().replace(/[^a-z]/g, "") + ".com");
  }
  if (phones.length === 0) {
    phones.push("+1 (555) 789-" + Math.floor(1000 + Math.random() * 9000));
  }

  const sampleKeywords = [
    fileName.split(".")[0].toLowerCase(),
    "serverless",
    "document",
    "verified",
    "textract",
    "indexed",
  ];

  // Update store document
  const userDocs = store.documents[userId] || [];
  const targetDoc = userDocs.find((d) => d.doc_id === docId);

  if (targetDoc) {
    targetDoc.processing_status = "PROCESSED";
    targetDoc.processed_timestamp = new Date().toISOString();
    targetDoc.extracted_text =
      textContent.length > 50 && !textContent.includes("\u0000")
        ? textContent
        : `DOCUSTREAM EXTRACTED TEXT FROM ${fileName}\n` +
          `File Size: ${(fileSize / (1024 * 1024)).toFixed(2)} MB\n` +
          `Primary Contact: ${emails[0]}\n` +
          `Phone: ${phones[0]}\n` +
          `Document Key: uploads/${userId}/${docId}/${fileName}\n` +
          `Processed using AWS Textract OCR Engine.\n` +
          `Content successfully categorized, indexed, and available for full-text search.`;
    targetDoc.parsed_metadata = {
      emails,
      phones,
      keywords: sampleKeywords,
    };
    targetDoc.file_size_bytes = fileSize;
    targetDoc.block_count = Math.floor(15 + Math.random() * 40);
  }

  // Update storage metrics
  if (store.quotas[userId]) {
    store.quotas[userId].totalStorageBytes += fileSize;
    store.quotas[userId].documentCount += 1;
    store.quotas[userId].usedMb = parseFloat(
      (store.quotas[userId].totalStorageBytes / (1024 * 1024)).toFixed(2)
    );
    store.quotas[userId].usagePercentage = Math.min(
      100,
      parseFloat(
        (
          (store.quotas[userId].totalStorageBytes / store.quotas[userId].maxAllowedBytes) *
          100
        ).toFixed(2)
      )
    );
  }

  return NextResponse.json({ success: true, docId, status: "PROCESSED" });
}
