"use client";

import React, { useState, useRef, DragEvent, ChangeEvent } from "react";
import {
  UploadCloud,
  File,
  CheckCircle2,
  AlertCircle,
  Loader2,
  FileText,
  Image as ImageIcon,
  X,
} from "lucide-react";
import {
  getPresignedUploadUrl,
  uploadFileToS3,
  pollDocumentProcessing,
  formatBytes,
} from "@/lib/api";
import { UploadProgress, DocumentItem } from "@/lib/types";

interface UploadDropzoneProps {
  userId: string;
  onUploadSuccess: (doc: DocumentItem) => void;
  onUploadError?: (errorMsg: string) => void;
}

const ALLOWED_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
];
const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB

export const UploadDropzone: React.FC<UploadDropzoneProps> = ({
  userId,
  onUploadSuccess,
  onUploadError,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [activeUploads, setActiveUploads] = useState<UploadProgress[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateFile = (file: File): string | null => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      return `Unsupported file format '${file.type || file.name}'. Allowed: PDF, PNG, JPEG.`;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return `File '${file.name}' (${formatBytes(file.size)}) exceeds the 20 MB single file limit.`;
    }
    return null;
  };

  const handleFiles = async (files: FileList | File[]) => {
    setErrorMessage(null);
    const fileArray = Array.from(files);

    for (const file of fileArray) {
      const error = validateFile(file);
      if (error) {
        setErrorMessage(error);
        if (onUploadError) onUploadError(error);
        continue;
      }

      await executeUploadPipeline(file);
    }
  };

  const executeUploadPipeline = async (file: File) => {
    const uploadItem: UploadProgress = {
      file,
      progress: 0,
      status: "requesting_url",
    };

    setActiveUploads((prev) => [uploadItem, ...prev]);

    try {
      // 1. Request presigned URL from API Gateway
      const presignedData = await getPresignedUploadUrl(
        file.name,
        file.size,
        file.type,
        userId
      );

      // Update progress state with docId
      setActiveUploads((prev) =>
        prev.map((item) =>
          item.file === file
            ? { ...item, docId: presignedData.docId, status: "uploading_s3", progress: 10 }
            : item
        )
      );

      // 2. Direct browser-to-bucket upload to S3 via PUT
      await uploadFileToS3(presignedData.uploadUrl, file, (progressPercent) => {
        // Map 0-100% upload to 10-85% total pipeline progress
        const overallProgress = Math.round(10 + progressPercent * 0.75);
        setActiveUploads((prev) =>
          prev.map((item) =>
            item.file === file
              ? { ...item, progress: overallProgress }
              : item
          )
        );
      });

      // 3. Document uploaded to S3, waiting for Textract trigger and DynamoDB persistence
      setActiveUploads((prev) =>
        prev.map((item) =>
          item.file === file
            ? { ...item, status: "processing_textract", progress: 90 }
            : item
        )
      );

      // 4. Poll status until Textract OCR & regex extraction completes
      const completedDoc = await pollDocumentProcessing(
        presignedData.docId,
        userId,
        (doc) => {
          if (doc.processing_status === "PROCESSING") {
            setActiveUploads((prev) =>
              prev.map((item) =>
                item.file === file
                  ? { ...item, status: "processing_textract", progress: 95 }
                  : item
              )
            );
          }
        }
      );

      // 5. Complete!
      setActiveUploads((prev) =>
        prev.map((item) =>
          item.file === file
            ? { ...item, status: "completed", progress: 100 }
            : item
        )
      );

      onUploadSuccess(completedDoc);

      // Clear from active uploads after 4 seconds
      setTimeout(() => {
        setActiveUploads((prev) => prev.filter((item) => item.file !== file));
      }, 4000);

    } catch (err: any) {
      const msg = err.response?.data?.error || err.message || "Failed to upload and process document";
      setActiveUploads((prev) =>
        prev.map((item) =>
          item.file === file
            ? { ...item, status: "error", errorMessage: msg }
            : item
        )
      );
      setErrorMessage(msg);
      if (onUploadError) onUploadError(msg);
    }
  };

  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const onFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files);
    }
  };

  return (
    <div className="space-y-4">
      {/* Drag & Drop Zone */}
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all duration-200 ${
          isDragging
            ? "border-indigo-500 bg-indigo-50/60 ring-4 ring-indigo-500/10 scale-[1.01]"
            : "border-slate-300 hover:border-indigo-400 bg-white hover:bg-slate-50/70 shadow-sm"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
          onChange={onFileInputChange}
          className="hidden"
        />

        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 mb-4 ring-8 ring-indigo-50/40">
          <UploadCloud className="h-7 w-7" />
        </div>

        <h4 className="text-base font-semibold text-slate-800 mb-1">
          Upload Documents for Instant Textract OCR & Metadata Extraction
        </h4>
        <p className="text-xs text-slate-500 max-w-md mx-auto mb-3">
          Drag and drop your files here, or <span className="text-indigo-600 font-medium">browse your computer</span>.
          Files upload securely straight to Amazon S3 via presigned URLs.
        </p>

        {/* Supported formats pills */}
        <div className="flex items-center justify-center space-x-2 text-[11px] text-slate-500">
          <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 font-medium text-slate-700">
            <FileText className="h-3 w-3 mr-1 text-rose-500" />
            PDF
          </span>
          <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 font-medium text-slate-700">
            <ImageIcon className="h-3 w-3 mr-1 text-emerald-500" />
            PNG
          </span>
          <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 font-medium text-slate-700">
            <ImageIcon className="h-3 w-3 mr-1 text-sky-500" />
            JPEG
          </span>
          <span className="text-slate-400">•</span>
          <span>Max 20 MB / file</span>
        </div>
      </div>

      {/* Global Error Banner */}
      {errorMessage && (
        <div className="flex items-center justify-between rounded-xl bg-rose-50 p-3.5 text-xs text-rose-800 border border-rose-200 shadow-sm">
          <div className="flex items-center space-x-2">
            <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button
            onClick={() => setErrorMessage(null)}
            className="text-rose-500 hover:text-rose-700 p-1"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Active Uploads / In-flight Cards */}
      {activeUploads.length > 0 && (
        <div className="space-y-2">
          {activeUploads.map((upload, idx) => (
            <div
              key={`${upload.file.name}-${idx}`}
              className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm"
            >
              <div className="flex items-center space-x-3 min-w-0">
                <div className="p-2 bg-slate-100 rounded-lg text-slate-600 shrink-0">
                  <File className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-800 truncate">
                    {upload.file.name}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {formatBytes(upload.file.size)} •{" "}
                    {upload.status === "requesting_url" && "Validating quota & preparing URL..."}
                    {upload.status === "uploading_s3" && `Uploading to S3 (${upload.progress}%)...`}
                    {upload.status === "processing_textract" && "AWS Textract OCR & Regex parsing..."}
                    {upload.status === "completed" && "Successfully processed and indexed"}
                    {upload.status === "error" && (
                      <span className="text-rose-600 font-medium">
                        {upload.errorMessage || "Upload failed"}
                      </span>
                    )}
                  </p>
                </div>
              </div>

              {/* Status / Indicator */}
              <div className="flex items-center space-x-3 shrink-0 ml-4">
                {upload.status !== "completed" && upload.status !== "error" && (
                  <div className="flex items-center space-x-2">
                    <div className="w-24 bg-slate-100 rounded-full h-2 overflow-hidden hidden sm:block">
                      <div
                        className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${upload.progress}%` }}
                      />
                    </div>
                    <Loader2 className="h-4 w-4 text-indigo-600 animate-spin" />
                  </div>
                )}
                {upload.status === "completed" && (
                  <div className="flex items-center space-x-1 text-xs text-emerald-600 font-medium bg-emerald-50 px-2 py-1 rounded-md border border-emerald-200">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>Done</span>
                  </div>
                )}
                {upload.status === "error" && (
                  <div className="flex items-center space-x-1 text-xs text-rose-600 font-medium bg-rose-50 px-2 py-1 rounded-md border border-rose-200">
                    <AlertCircle className="h-3.5 w-3.5" />
                    <span>Failed</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
