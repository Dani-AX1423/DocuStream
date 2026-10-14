import { NextRequest, NextResponse } from "next/server";
import { store } from "../mockData";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId") || "user-demo-1";

  if (!store.quotas[userId]) {
    store.quotas[userId] = {
      userId,
      totalStorageBytes: 0,
      maxAllowedBytes: 104857600,
      usedMb: 0,
      maxMb: 100,
      usagePercentage: 0,
      documentCount: 0,
    };
  }

  const documents = store.documents[userId] || [];
  const quota = store.quotas[userId];

  return NextResponse.json({
    documents,
    quota,
    count: documents.length,
  });
}
