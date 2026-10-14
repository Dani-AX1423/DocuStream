"use client";

import React, { useState } from "react";
import {
  FileText,
  Image as ImageIcon,
  Trash2,
  Eye,
  Mail,
  Phone,
  Tag,
  Clock,
  Loader2,
  AlertCircle,
  CheckCircle,
  Download,
} from "lucide-react";

import { DocumentItem } from "@/lib/types";
import { formatBytes } from "@/lib/api";

interface DocumentCardProps {
  document: DocumentItem;
  onView: (doc: DocumentItem) => void;
  onDelete: (docId: string) => Promise<void>;
}

export const DocumentCard: React.FC<DocumentCardProps> = ({
  document,
  onView,
  onDelete,
}) => {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm(`Are you sure you want to delete '${document.file_name}'? This will remove the file from Amazon S3, delete the DynamoDB record, and free up storage quota.`)) {
      setIsDeleting(true);
      try {
        await onDelete(document.doc_id);
      } finally {
        setIsDeleting(false);
      }
    }
  };

  const isPdf = document.file_name.toLowerCase().endsWith(".pdf");
  const emails = document.parsed_metadata?.emails || [];
  const phones = document.parsed_metadata?.phones || [];
  const keywords = (document.parsed_metadata?.keywords || []).slice(0, 4);

  return (
    <div
      onClick={() => onView(document)}
      className="group relative flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md hover:border-indigo-300 transition-all duration-200 cursor-pointer"
    >
      <div>
        {/* Top bar: icon, filename, status, delete */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center space-x-3 min-w-0">
            <div
              className={`p-2.5 rounded-xl shrink-0 ${
                isPdf ? "bg-rose-50 text-rose-600" : "bg-sky-50 text-sky-600"
              }`}
            >
              {isPdf ? <FileText className="h-5 w-5" /> : <ImageIcon className="h-5 w-5" />}
            </div>
            <div className="min-w-0">
              <h4 className="text-sm font-bold text-slate-900 truncate group-hover:text-indigo-600 transition-colors">
                {document.file_name}
              </h4>
              <p className="text-xs text-slate-500 flex items-center space-x-1.5">
                <span>{formatBytes(document.file_size_bytes)}</span>
                <span>•</span>
                <span>{new Date(document.upload_timestamp).toLocaleDateString()}</span>
              </p>
            </div>
          </div>

          {/* Action Buttons: Direct Download & Delete */}
          <div className="flex items-center space-x-1 shrink-0">
            {document.downloadUrl && (
              <a
                href={document.downloadUrl}
                download={document.file_name}
                onClick={(e) => e.stopPropagation()}
                title="Download directly to your computer"
                className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
              >
                <Download className="h-4 w-4" />
              </a>
            )}
            <button
              onClick={handleDelete}
              disabled={isDeleting}
              title="Delete document and restore quota"
              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
            >
              {isDeleting ? (
                <Loader2 className="h-4 w-4 animate-spin text-rose-600" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
            </button>
          </div>

        </div>

        {/* Processing Status Badge */}
        <div className="mb-3">
          {document.processing_status === "PROCESSED" && (
            <span className="inline-flex items-center text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
              <CheckCircle className="h-3 w-3 mr-1 text-emerald-500" />
              Textract Processed
            </span>
          )}
          {document.processing_status === "PROCESSING" && (
            <span className="inline-flex items-center text-[11px] font-semibold text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200">
              <Loader2 className="h-3 w-3 mr-1 text-amber-500 animate-spin" />
              Extracting Text...
            </span>
          )}
          {document.processing_status === "PENDING_UPLOAD" && (
            <span className="inline-flex items-center text-[11px] font-semibold text-sky-700 bg-sky-50 px-2.5 py-0.5 rounded-full border border-sky-200">
              <Clock className="h-3 w-3 mr-1 text-sky-500" />
              Pending Upload
            </span>
          )}
          {document.processing_status === "FAILED" && (
            <span className="inline-flex items-center text-[11px] font-semibold text-rose-700 bg-rose-50 px-2.5 py-0.5 rounded-full border border-rose-200">
              <AlertCircle className="h-3 w-3 mr-1 text-rose-500" />
              Processing Failed
            </span>
          )}
        </div>

        {/* Extracted Metadata Pills */}
        <div className="space-y-1.5 mb-4 text-xs">
          {emails.length > 0 && (
            <div className="flex items-center space-x-1.5 text-slate-600 truncate">
              <Mail className="h-3.5 w-3.5 text-sky-500 shrink-0" />
              <span className="truncate">{emails[0]}</span>
              {emails.length > 1 && (
                <span className="text-[10px] text-slate-400 font-semibold">
                  +{emails.length - 1}
                </span>
              )}
            </div>
          )}

          {phones.length > 0 && (
            <div className="flex items-center space-x-1.5 text-slate-600 truncate">
              <Phone className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
              <span className="truncate">{phones[0]}</span>
            </div>
          )}

          {keywords.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {keywords.map((kw, i) => (
                <span
                  key={i}
                  className="inline-flex items-center text-[10px] font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md"
                >
                  #{kw}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Text Preview Snippet */}
        {document.extracted_text && (
          <p className="text-xs text-slate-500 line-clamp-2 italic bg-slate-50 p-2 rounded-lg border border-slate-100 font-mono">
            "{document.extracted_text.slice(0, 160).replace(/\n/g, " ")}..."
          </p>
        )}
      </div>

      {/* Footer / Card Bottom */}
      <div className="pt-3 mt-3 border-t border-slate-100 flex items-center justify-between text-xs text-indigo-600 font-medium">
        <span className="flex items-center space-x-1">
          <Eye className="h-3.5 w-3.5" />
          <span>View Text & Details</span>
        </span>
        <span className="text-slate-400 text-[11px]">Click to inspect</span>
      </div>
    </div>
  );
};
