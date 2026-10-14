import { NextRequest, NextResponse } from "next/server";
import { store } from "../../mockData";

export async function DELETE(
  request: NextRequest,
  { params }: { params: { docId: string } }
) {
  const { docId } = params;
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId") || "user-demo-1";

  const userDocs = store.documents[userId] || [];
  const docIndex = userDocs.findIndex((d) => d.doc_id === docId);

  if (docIndex === -1) {
    return NextResponse.json(
      { error: `Document ${docId} not found` },
      { status: 404 }
    );
  }

  const [removedDoc] = userDocs.splice(docIndex, 1);
  const freedBytes = removedDoc.file_size_bytes || 0;

  // Restore quota
  if (store.quotas[userId]) {
    store.quotas[userId].totalStorageBytes = Math.max(
      0,
      store.quotas[userId].totalStorageBytes - freedBytes
    );
    store.quotas[userId].documentCount = Math.max(
      0,
      store.quotas[userId].documentCount - 1
    );
    store.quotas[userId].usedMb = parseFloat(
      (store.quotas[userId].totalStorageBytes / (1024 * 1024)).toFixed(2)
    );
    store.quotas[userId].usagePercentage = Math.min(
      100,
      parseFloat(
        (
          (store.quotas[userId].totalStorageBytes /
            store.quotas[userId].maxAllowedBytes) *
          100
        ).toFixed(2)
      )
    );
  }

  return NextResponse.json({
    message: "Document deleted successfully",
    docId,
    freedBytes,
    userId,
  });
}
