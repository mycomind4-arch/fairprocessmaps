"use client";

import { Search } from "lucide-react";

interface SearchBarProps {
  value: string;
  onChange: (v: string) => void;
}

export default function SearchBar({ value, onChange }: SearchBarProps) {
  return (
    <div className="relative">
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-fp-gray-400" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search properties, evidence, addresses..."
        className="w-full pl-9 pr-3 py-1.5 text-sm border border-fp-gray-200 rounded-lg bg-fp-gray-50 focus:outline-none focus:ring-2 focus:ring-fp-blue/20 focus:border-fp-blue transition-all"
      />
    </div>
  );
}
