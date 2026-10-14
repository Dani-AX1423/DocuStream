"use client";

import React from "react";
import { HardDrive, AlertTriangle, CheckCircle, Database } from "lucide-react";
import { UserQuota } from "@/lib/types";
import { formatBytes } from "@/lib/api";

interface StorageMeterProps {
  quota: UserQuota | null;
  isLoading?: boolean;
}

export const StorageMeter: React.FC<StorageMeterProps> = ({ quota, isLoading }) => {
  if (isLoading || !quota) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm animate-pulse">
        <div className="h-4 w-32 bg-slate-200 rounded mb-3"></div>
        <div className="h-2.5 w-full bg-slate-100 rounded mb-2"></div>
        <div className="h-3 w-48 bg-slate-100 rounded"></div>
      </div>
    );
  }

  const usedBytes = quota.totalStorageBytes || 0;
  const maxBytes = quota.maxAllowedBytes || 104857600; // 100 MB default
  const usedFormatted = formatBytes(usedBytes);
  const maxFormatted = formatBytes(maxBytes);
  const remainingBytes = Math.max(0, maxBytes - usedBytes);
  const remainingFormatted = formatBytes(remainingBytes);
  const percentage = Math.min(100, Math.round((usedBytes / maxBytes) * 1000) / 10);

  // Status colors based on consumption
  let progressColor = "bg-indigo-600";
  let statusBadge = (
    <span className="flex items-center text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
      <CheckCircle className="h-3 w-3 mr-1 text-emerald-500" />
      Quota Healthy
    </span>
  );

  if (percentage >= 90) {
    progressColor = "bg-rose-600";
    statusBadge = (
      <span className="flex items-center text-xs font-medium text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
        <AlertTriangle className="h-3 w-3 mr-1 text-rose-500" />
        Storage Critical
      </span>
    );
  } else if (percentage >= 70) {
    progressColor = "bg-amber-500";
    statusBadge = (
      <span className="flex items-center text-xs font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
        <AlertTriangle className="h-3 w-3 mr-1 text-amber-500" />
        High Storage
      </span>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-2">
          <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600">
            <HardDrive className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Storage Usage Quota</h3>
            <p className="text-xs text-slate-500">Per-user multi-tenant quota allocation</p>
          </div>
        </div>
        {statusBadge}
      </div>

      {/* Numerical Usage Display */}
      <div className="flex items-baseline justify-between mb-2">
        <div className="text-lg font-bold text-slate-900">
          {quota.usedMb ?? (usedBytes / (1024 * 1024)).toFixed(2)} MB{" "}
          <span className="text-xs font-normal text-slate-500">
            / {quota.maxMb ?? (maxBytes / (1024 * 1024)).toFixed(0)} MB used
          </span>
        </div>
        <div className="text-xs font-semibold text-slate-700">
          {percentage.toFixed(1)}%
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden mb-3">
        <div
          className={`h-2.5 rounded-full transition-all duration-500 ease-out ${progressColor}`}
          style={{ width: `${Math.max(percentage, 2)}%` }}
        />
      </div>

      {/* Quota Footnote details */}
      <div className="flex flex-wrap items-center justify-between gap-y-1 text-xs text-slate-500 pt-1 border-t border-slate-100">
        <span>
          <strong className="text-slate-700">{quota.documentCount}</strong> documents stored
        </span>
        <span>
          <strong className="text-slate-700">{remainingFormatted}</strong> available
        </span>
        <span className="text-[11px] text-slate-400">
          Max file size: 20 MB
        </span>
      </div>
    </div>
  );
};
