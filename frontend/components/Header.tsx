"use client";

import React from "react";
import { FileText, Cpu, Cloud, CheckCircle, Database, Layers } from "lucide-react";
import { getApiBaseUrl } from "@/lib/api";


interface HeaderProps {
  userId: string;
  onUserChange: (newUserId: string) => void;
}

export const Header: React.FC<HeaderProps> = ({ userId, onUserChange }) => {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        {/* Brand / Logo */}
        <div className="flex items-center space-x-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 to-indigo-400 shadow-md shadow-indigo-500/20 text-white">
            <FileText className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xl font-bold tracking-tight text-slate-900">
                Docu<span className="text-indigo-600">Stream</span>
              </span>
              <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700 border border-indigo-200/60">
                Web v1.0
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Serverless Document Intelligence & OCR Pipeline
            </p>
          </div>
        </div>

        {/* System Architecture Pills & User Switcher */}
        <div className="flex items-center space-x-4">
          {/* Architecture Badge */}
          <div className="hidden md:flex items-center space-x-2 text-xs text-slate-600 bg-slate-100 rounded-lg px-3 py-1.5 border border-slate-200">
            <span className="flex items-center font-medium text-slate-700">
              <Cloud className="h-3.5 w-3.5 mr-1 text-sky-500" />
              S3
            </span>
            <span className="text-slate-300">→</span>
            <span className="flex items-center font-medium text-slate-700">
              <Cpu className="h-3.5 w-3.5 mr-1 text-amber-500" />
              Textract
            </span>
            <span className="text-slate-300">→</span>
            <span className="flex items-center font-medium text-slate-700">
              <Database className="h-3.5 w-3.5 mr-1 text-emerald-500" />
              DynamoDB
            </span>
          </div>

          {/* Connection Status Indicator */}
          <div className="flex items-center space-x-1.5 text-xs rounded-full px-2.5 py-1 font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="hidden sm:inline">
              {getApiBaseUrl() ? "API Gateway Connected" : "Local Edge Mode"}
            </span>

            <span className="sm:hidden">Active</span>
          </div>

          {/* User Account Switcher */}
          <div className="flex items-center space-x-2">
            <label htmlFor="user-select" className="text-xs font-medium text-slate-500 hidden sm:inline">
              User:
            </label>
            <select
              id="user-select"
              value={userId}
              onChange={(e) => onUserChange(e.target.value)}
              className="text-xs font-semibold bg-white border border-slate-300 text-slate-800 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 shadow-sm"
            >
              <option value="user-demo-1">Demo User 1</option>
              <option value="user-demo-2">Demo User 2</option>
              <option value="admin-enterprise">Enterprise User</option>
            </select>
          </div>
        </div>
      </div>

      {/* Public Demo Mode - Shared Workspace Banner */}
      <div className="bg-slate-50 border-t border-slate-200/80 px-4 py-1.5 text-center text-[11px] text-slate-500 flex items-center justify-center space-x-2">
        <span className="inline-flex items-center font-medium text-slate-700">
          <Layers className="h-3 w-3 mr-1 text-indigo-500" />
          Public Demo Mode - Shared Workspace
        </span>
        <span className="text-slate-300">•</span>
        <span>Storage capped at 100 MB aggregate & 20 MB per file</span>
      </div>
    </header>
  );
};
