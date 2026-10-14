"use client";

import React from "react";
import { Search, Filter, ArrowUpDown, X } from "lucide-react";

interface SearchFilterBarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  statusFilter: string;
  onStatusFilterChange: (status: string) => void;
  sortBy: "date_desc" | "date_asc" | "size_desc" | "size_asc";
  onSortByChange: (sort: "date_desc" | "date_asc" | "size_desc" | "size_asc") => void;
  totalCount: number;
  filteredCount: number;
}

export const SearchFilterBar: React.FC<SearchFilterBarProps> = ({
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  sortBy,
  onSortByChange,
  totalCount,
  filteredCount,
}) => {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm space-y-3 sm:space-y-0 sm:flex sm:items-center sm:justify-between sm:gap-4">
      {/* Search Input */}
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Filter by filename, extracted text, email, phone, or keyword..."
          className="w-full rounded-lg border border-slate-200 bg-slate-50/60 pl-9 pr-9 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
        />
        {searchQuery && (
          <button
            onClick={() => onSearchChange("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Filters & Sorting */}
      <div className="flex flex-wrap items-center gap-2 shrink-0">
        {/* Status Filter */}
        <div className="flex items-center space-x-1 bg-slate-100 rounded-lg p-0.5 border border-slate-200 text-xs">
          {["ALL", "PROCESSED", "PROCESSING", "FAILED"].map((status) => (
            <button
              key={status}
              onClick={() => onStatusFilterChange(status)}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                statusFilter === status
                  ? "bg-white text-indigo-700 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {status === "ALL" ? "All" : status.charAt(0) + status.slice(1).toLowerCase()}
            </button>
          ))}
        </div>

        {/* Sort Dropdown */}
        <div className="flex items-center space-x-1 text-xs">
          <ArrowUpDown className="h-3.5 w-3.5 text-slate-400" />
          <select
            value={sortBy}
            onChange={(e) => onSortByChange(e.target.value as any)}
            className="rounded-lg border border-slate-200 bg-white py-1.5 px-2 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
          >
            <option value="date_desc">Newest First</option>
            <option value="date_asc">Oldest First</option>
            <option value="size_desc">Largest Size</option>
            <option value="size_asc">Smallest Size</option>
          </select>
        </div>

        {/* Count summary */}
        <span className="text-[11px] text-slate-400 font-medium pl-1">
          {filteredCount} of {totalCount}
        </span>
      </div>
    </div>
  );
};
