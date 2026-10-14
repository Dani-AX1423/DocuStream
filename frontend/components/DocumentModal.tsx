"use client";

import React, { useState } from "react";
import {
  X,
  Copy,
  Check,
  Mail,
  Phone,
  Tag,
  FileText,
  Calendar,
  HardDrive,
  Download,
  AlertCircle,
  ExternalLink,
} from "lucide-react";
import { DocumentItem } from "@/lib/types";
import { formatBytes } from "@/lib/api";

interface DocumentModalProps {
  document: DocumentItem | null;
  onClose: () => void;
  searchQuery?: string;
}

export const DocumentModal: React.FC<DocumentModalProps> = ({
  document,
  onClose,
  searchQuery,
}) => {
  const [copied, setCopied] = useState(false);

  if (!document) return null;

  const handleCopyText = () => {
    if (document.extracted_text) {
      navigator.clipboard.writeText(document.extracted_text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const emails = document.parsed_metadata?.emails || [];
  const phones = document.parsed_metadata?.phones || [];
  const keywords = document.parsed_metadata?.keywords || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative flex flex-col w-full max-w-4xl max-h-[90vh] bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 bg-slate-50/70">
          <div className="flex items-center space-x-3 min-w-0">
            <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
              <FileText className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-bold text-slate-900 truncate">
                {document.file_name}
              </h3>
              <p className="text-xs text-slate-500 flex items-center gap-2">
                <span>{formatBytes(document.file_size_bytes)}</span>
                <span>•</span>
                <span>ID: {document.doc_id}</span>
                <span>•</span>
                <span
                  className={`inline-flex items-center px-2 py-0.2 rounded-full text-[10px] font-semibold ${
                    document.processing_status === "PROCESSED"
                      ? "bg-emerald-100 text-emerald-800"
                      : document.processing_status === "PROCESSING"
                      ? "bg-amber-100 text-amber-800"
                      : "bg-rose-100 text-rose-800"
                  }`}
                >
                  {document.processing_status}
                </span>
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {document.viewUrl && (
              <a
                href={document.viewUrl}
                target="_blank"
                rel="noreferrer"
                title="Open original file in a new tab"
                className="inline-flex items-center space-x-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-sm transition-colors"
              >
                <ExternalLink className="h-3.5 w-3.5 text-indigo-500" />
                <span className="hidden sm:inline">Preview</span>
              </a>
            )}
            {document.downloadUrl && (
              <a
                href={document.downloadUrl}
                download={document.file_name}
                title="Download directly to your computer"
                className="inline-flex items-center space-x-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 shadow-sm transition-colors"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Download</span>
              </a>
            )}
            <button
              onClick={onClose}
              className="rounded-lg p-2 text-slate-400 hover:bg-slate-200/60 hover:text-slate-600 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>


        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
          {/* Metadata Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Extracted Emails */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
              <div className="flex items-center space-x-2 text-xs font-semibold text-slate-700 mb-2">
                <Mail className="h-4 w-4 text-sky-600" />
                <span>Extracted Emails ({emails.length})</span>
              </div>
              {emails.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {emails.map((email, i) => (
                    <a
                      key={i}
                      href={`mailto:${email}`}
                      className="inline-flex items-center text-xs font-medium text-sky-700 bg-sky-50 px-2.5 py-1 rounded-md border border-sky-200 hover:bg-sky-100 transition-colors"
                    >
                      {email}
                    </a>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400 italic">No emails detected by regex.</p>
              )}
            </div>

            {/* Extracted Phone Numbers */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
              <div className="flex items-center space-x-2 text-xs font-semibold text-slate-700 mb-2">
                <Phone className="h-4 w-4 text-emerald-600" />
                <span>Extracted Phones ({phones.length})</span>
              </div>
              {phones.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {phones.map((phone, i) => (
                    <a
                      key={i}
                      href={`tel:${phone}`}
                      className="inline-flex items-center text-xs font-medium text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200 hover:bg-emerald-100 transition-colors"
                    >
                      {phone}
                    </a>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400 italic">No phone numbers detected.</p>
              )}
            </div>

            {/* Extracted Keywords */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
              <div className="flex items-center space-x-2 text-xs font-semibold text-slate-700 mb-2">
                <Tag className="h-4 w-4 text-indigo-600" />
                <span>Keywords & Topics ({keywords.length})</span>
              </div>
              {keywords.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {keywords.map((kw, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center text-xs font-medium text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-200"
                    >
                      #{kw}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400 italic">No keywords extracted.</p>
              )}
            </div>
          </div>

          {/* S3 Storage Path Details */}
          <div className="rounded-xl bg-slate-900 text-slate-200 p-4 text-xs font-mono">
            <div className="flex items-center justify-between text-slate-400 mb-1">
              <span>S3 Object Key</span>
              <span>Bucket: {document.s3_bucket || "docustream-web-storage"}</span>
            </div>
            <p className="text-slate-100 break-all select-all">{document.s3_key}</p>
          </div>

          {/* Plain Text Extracted by AWS Textract */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-slate-900 flex items-center space-x-2">
                <span>Extracted Plain Text (Textract OCR)</span>
                {document.block_count && (
                  <span className="text-xs font-normal text-slate-500">
                    ({document.block_count} blocks processed)
                  </span>
                )}
              </h4>
              <button
                onClick={handleCopyText}
                className="inline-flex items-center space-x-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-sm"
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                    <span className="text-emerald-700">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5 text-slate-500" />
                    <span>Copy Text</span>
                  </>
                )}
              </button>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-800 font-mono whitespace-pre-wrap leading-relaxed max-h-80 overflow-y-auto custom-scrollbar select-text">
              {document.extracted_text || (
                <span className="text-slate-400 italic">
                  {document.processing_status === "PROCESSING"
                    ? "AWS Textract is currently performing OCR on this document..."
                    : "No text blocks were extracted from this document."}
                </span>
              )}
            </div>
          </div>

          {/* Error Message if Failed */}
          {document.error_message && (
            <div className="rounded-xl bg-rose-50 border border-rose-200 p-4 text-xs text-rose-800">
              <div className="flex items-center space-x-2 font-semibold mb-1">
                <AlertCircle className="h-4 w-4 text-rose-600" />
                <span>Processing Error Details</span>
              </div>
              <p className="font-mono">{document.error_message}</p>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="border-t border-slate-200 px-6 py-3.5 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
          <span>Uploaded {new Date(document.upload_timestamp).toLocaleString()}</span>
          <button
            onClick={onClose}
            className="rounded-lg bg-slate-800 hover:bg-slate-900 text-white font-medium px-4 py-2 text-xs shadow-sm transition-colors"
          >
            Close Viewer
          </button>
        </div>
      </div>
    </div>
  );
};
