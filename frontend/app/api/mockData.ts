import { DocumentItem, UserQuota } from "@/lib/types";

// In-memory store for local demonstration/mock testing
interface Store {
  documents: Record<string, DocumentItem[]>;
  quotas: Record<string, UserQuota>;
}

const globalForStore = global as unknown as { mockStore: Store };

export const store: Store = globalForStore.mockStore || {
  documents: {
    "user-demo-1": [
      {
        doc_id: "demo-doc-1",
        user_id: "user-demo-1",
        file_name: "Software_Architect_Resume.pdf",
        s3_key: "uploads/user-demo-1/demo-doc-1/Software_Architect_Resume.pdf",
        file_size_bytes: 2621440, // 2.5 MB
        content_type: "application/pdf",
        upload_timestamp: new Date(Date.now() - 3600000).toISOString(),
        processed_timestamp: new Date(Date.now() - 3540000).toISOString(),
        processing_status: "PROCESSED",
        extracted_text:
          "Jane Doe\nPrincipal Cloud Architect & Distributed Systems Engineer\nEmail: jane.doe@antigravity.io\nDirect: +1 (415) 890-4321\nSan Francisco, CA\n\nEXPERIENCE\nLead Architect at CloudStream Technologies\n- Designed serverless ingestion pipelines on AWS Textract, S3, and DynamoDB.\n- Reduced optical character recognition latency by 45%.\n\nSKILLS\nAWS SAM, Python 3.11, Next.js, TypeScript, DynamoDB, Textract, CloudFormation, Terraform, EventBridge.",
        parsed_metadata: {
          emails: ["jane.doe@antigravity.io"],
          phones: ["+1 (415) 890-4321"],
          keywords: [
            "architect",
            "serverless",
            "textract",
            "dynamodb",
            "cloudstream",
            "distributed",
            "typescript",
            "python",
          ],
        },
        downloadUrl: "#",
        block_count: 48,
      },
      {
        doc_id: "demo-doc-2",
        user_id: "user-demo-1",
        file_name: "Q3_Financial_Invoice_884.png",
        s3_key: "uploads/user-demo-1/demo-doc-2/Q3_Financial_Invoice_884.png",
        file_size_bytes: 4194304, // 4.0 MB
        content_type: "image/png",
        upload_timestamp: new Date(Date.now() - 7200000).toISOString(),
        processed_timestamp: new Date(Date.now() - 7150000).toISOString(),
        processing_status: "PROCESSED",
        extracted_text:
          "INVOICE #INV-2026-884\nBilling Contact: accounts@vertexcorp.net\nPhone: (650) 555-0142\nDue Date: October 30, 2026\nItem: Cloud Storage & AI Inference Pipeline\nSubtotal: $12,450.00\nTax: $1,120.50\nTotal Due: $13,570.50\nRemit payment via ACH or Wire.",
        parsed_metadata: {
          emails: ["accounts@vertexcorp.net"],
          phones: ["(650) 555-0142"],
          keywords: ["invoice", "accounts", "storage", "pipeline", "subtotal", "remit", "payment"],
        },
        downloadUrl: "#",
        block_count: 32,
      },
    ],
  },
  quotas: {
    "user-demo-1": {
      userId: "user-demo-1",
      totalStorageBytes: 6815744, // 6.5 MB
      maxAllowedBytes: 104857600, // 100 MB
      usedMb: 6.5,
      maxMb: 100,
      usagePercentage: 6.5,
      documentCount: 2,
    },
  },
};

if (process.env.NODE_ENV !== "production") {
  globalForStore.mockStore = store;
}
