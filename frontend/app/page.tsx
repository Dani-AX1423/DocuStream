"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Header } from "@/components/Header";
import { StorageMeter } from "@/components/StorageMeter";
import { UploadDropzone } from "@/components/UploadDropzone";
import { SearchFilterBar } from "@/components/SearchFilterBar";
import { DocumentList } from "@/components/DocumentList";
import { DocumentModal } from "@/components/DocumentModal";
import { DocumentItem, UserQuota } from "@/lib/types";
import { fetchDocuments, deleteDocument } from "@/lib/api";
import { RefreshCw, FileText, CheckCircle2, Shield, Zap } from "lucide-react";

export default function DashboardPage() {
  const [userId, setUserId] = useState<string>("user-demo-1");
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [quota, setQuota] = useState<UserQuota | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [sortBy, setSortBy] = useState<
    "date_desc" | "date_asc" | "size_desc" | "size_asc"
  >("date_desc");

  // Selected document for modal viewer
  const [selectedDoc, setSelectedDoc] = useState<DocumentItem | null>(null);

  // Load documents and user quota
  const loadData = useCallback(async (uid: string, showSpinner = true) => {
    if (showSpinner) setIsLoading(true);
    else setIsRefreshing(true);

    try {
      const data = await fetchDocuments(uid);
      setDocuments(data.documents || []);
      setQuota(data.quota || null);
    } catch (err) {
      console.error("Failed to load documents:", err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData(userId, true);
  }, [userId, loadData]);

  // Handle successful upload from Dropzone
  const handleUploadSuccess = (newDoc: DocumentItem) => {
    // Refresh data to update quota and get complete list
    loadData(userId, false);
    // Auto-open new document in viewer if desired
    setSelectedDoc(newDoc);
  };

  // Handle document deletion
  const handleDeleteDocument = async (docId: string) => {
    try {
      await deleteDocument(docId, userId);
      // Optimistically remove from state
      setDocuments((prev) => prev.filter((d) => d.doc_id !== docId));
      if (selectedDoc?.doc_id === docId) {
        setSelectedDoc(null);
      }
      // Re-fetch quota
      loadData(userId, false);
    } catch (err: any) {
      alert(`Delete error: ${err.message || "Failed to delete document"}`);
    }
  };

  // Filtered and Sorted Documents
  const filteredDocuments = useMemo(() => {
    let list = [...documents];

    // Status filter
    if (statusFilter !== "ALL") {
      list = list.filter((doc) => doc.processing_status === statusFilter);
    }

    // Text search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((doc) => {
        const nameMatch = doc.file_name.toLowerCase().includes(q);
        const textMatch = doc.extracted_text.toLowerCase().includes(q);
        const emailMatch = doc.parsed_metadata?.emails?.some((e) =>
          e.toLowerCase().includes(q)
        );
        const phoneMatch = doc.parsed_metadata?.phones?.some((p) =>
          p.toLowerCase().includes(q)
        );
        const keywordMatch = doc.parsed_metadata?.keywords?.some((k) =>
          k.toLowerCase().includes(q)
        );
        return nameMatch || textMatch || emailMatch || phoneMatch || keywordMatch;
      });
    }

    // Sorting
    list.sort((a, b) => {
      if (sortBy === "date_desc") {
        return (
          new Date(b.upload_timestamp).getTime() -
          new Date(a.upload_timestamp).getTime()
        );
      }
      if (sortBy === "date_asc") {
        return (
          new Date(a.upload_timestamp).getTime() -
          new Date(b.upload_timestamp).getTime()
        );
      }
      if (sortBy === "size_desc") {
        return b.file_size_bytes - a.file_size_bytes;
      }
      if (sortBy === "size_asc") {
        return a.file_size_bytes - b.file_size_bytes;
      }
      return 0;
    });

    return list;
  }, [documents, statusFilter, searchQuery, sortBy]);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Sticky Top Header */}
      <Header userId={userId} onUserChange={setUserId} />

      {/* Main Content Area */}
      <main className="flex-1 mx-auto max-w-7xl w-full px-4 py-8 sm:px-6 lg:px-8 space-y-8">
        {/* Top Hero & Storage Banner */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          <div className="lg:col-span-2 space-y-3">
            <div className="inline-flex items-center space-x-2 text-xs font-semibold uppercase tracking-wider text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-md border border-indigo-200/60">
              <Zap className="h-3.5 w-3.5 text-indigo-500" />
              <span>Real-Time OCR & Serverless Extraction</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
              Serverless Document Processing Platform
            </h1>
            <p className="text-sm text-slate-600 max-w-2xl leading-relaxed">
              Upload PDF documents or scanned receipts straight to Amazon S3. AWS Lambda and Textract automatically detect text, extract contacts with regex, and index metadata in DynamoDB.
            </p>

            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 pt-1">
              <div className="flex items-center space-x-1.5">
                <Shield className="h-4 w-4 text-emerald-600" />
                <span>Zero Public S3 Access (Presigned PUT URLs)</span>
              </div>
              <div className="flex items-center space-x-1.5">
                <CheckCircle2 className="h-4 w-4 text-indigo-600" />
                <span>Multi-tenant Quota Enforced</span>
              </div>
            </div>
          </div>

          {/* Storage Quota Meter Card */}
          <div className="lg:col-span-1">
            <StorageMeter quota={quota} isLoading={isLoading} />
          </div>
        </div>

        {/* Upload Dropzone Section */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700">
              Upload New Documents
            </h2>
          </div>
          <UploadDropzone
            userId={userId}
            onUploadSuccess={handleUploadSuccess}
          />
        </section>

        {/* Document Explorer & Management Section */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                Document Repository & Metadata Index
              </h2>
              <p className="text-xs text-slate-500">
                Real-time search across extracted texts, emails, phone numbers, and keywords
              </p>
            </div>

            <button
              onClick={() => loadData(userId, false)}
              disabled={isRefreshing}
              className="inline-flex items-center space-x-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-sm transition-colors"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 text-slate-500 ${
                  isRefreshing ? "animate-spin text-indigo-600" : ""
                }`}
              />
              <span>Refresh</span>
            </button>
          </div>

          {/* Search, Filter, and Sort Controls */}
          <SearchFilterBar
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            sortBy={sortBy}
            onSortByChange={setSortBy}
            totalCount={documents.length}
            filteredCount={filteredDocuments.length}
          />

          {/* Document Cards List */}
          <DocumentList
            documents={filteredDocuments}
            isLoading={isLoading}
            onViewDocument={setSelectedDoc}
            onDeleteDocument={handleDeleteDocument}
            hasFilterActive={Boolean(searchQuery.trim() || statusFilter !== "ALL")}
          />
        </section>
      </main>

      {/* Document Detail Modal */}
      {selectedDoc && (
        <DocumentModal
          document={selectedDoc}
          onClose={() => setSelectedDoc(null)}
          searchQuery={searchQuery}
        />
      )}

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-6 mt-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-3">
          <div className="flex items-center space-x-2">
            <span className="font-semibold text-slate-800">DocuStream Web</span>
            <span>•</span>
            <span>AWS SAM + Python 3.11 + Next.js + Textract</span>
          </div>
          <div>
            <span>Production Serverless Document Architecture</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
