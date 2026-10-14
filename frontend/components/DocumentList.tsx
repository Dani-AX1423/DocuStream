"use client";

import React from "react";
import { DocumentItem } from "@/lib/types";
import { DocumentCard } from "./DocumentCard";
import { FileQuestion, FolderOpen, Loader2 } from "lucide-react";

interface DocumentListProps {
  documents: DocumentItem[];
  isLoading: boolean;
  onViewDocument: (doc: DocumentItem) => void;
  onDeleteDocument: (docId: string) => Promise<void>;
  hasFilterActive: boolean;
}

export const DocumentList: React.FC<DocumentListProps> = ({
  documents,
  isLoading,
  onViewDocument,
  onDeleteDocument,
  hasFilterActive,
}) => {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3, 4, 5, 6].map((idx) => (
          <div
            key={idx}
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm animate-pulse space-y-4"
          >
            <div className="flex items-center space-x-3">
              <div className="h-10 w-10 bg-slate-200 rounded-xl" />
              <div className="space-y-1.5 flex-1">
                <div className="h-4 bg-slate-200 rounded w-3/4" />
                <div className="h-3 bg-slate-100 rounded w-1/2" />
              </div>
            </div>
            <div className="h-4 bg-slate-100 rounded w-1/4" />
            <div className="h-12 bg-slate-50 rounded-lg" />
          </div>
        ))}
      </div>
    );
  }

  if (documents.length === 0) {
    if (hasFilterActive) {
      return (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-500 mb-3">
            <FileQuestion className="h-6 w-6" />
          </div>
          <h4 className="text-base font-semibold text-slate-800 mb-1">
            No matching documents found
          </h4>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Try adjusting your search terms, filtering by a different status, or clearing the search query.
          </p>
        </div>
      );
    }

    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 mb-3">
          <FolderOpen className="h-6 w-6" />
        </div>
        <h4 className="text-base font-semibold text-slate-800 mb-1">
          No documents processed yet
        </h4>
        <p className="text-xs text-slate-500 max-w-sm mx-auto mb-4">
          Upload PDF documents, invoices, or images using the dropzone above to begin automatic OCR extraction.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {documents.map((doc) => (
        <DocumentCard
          key={doc.doc_id}
          document={doc}
          onView={onViewDocument}
          onDelete={onDeleteDocument}
        />
      ))}
    </div>
  );
};
