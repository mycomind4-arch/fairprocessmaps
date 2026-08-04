"use client";

import type { LucideIcon } from "lucide-react";

interface PlaceholderProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: { label: string; onClick: () => void };
}

export default function PlaceholderPanel({ icon: Icon, title, description, action }: PlaceholderProps) {
  return (
    <div className="space-y-5 pb-8 max-w-4xl">
      <div>
        <h2 className="text-lg font-semibold text-fp-text">{title}</h2>
        <p className="text-xs text-fp-text-dim mt-0.5">{description}</p>
      </div>
      <div className="rounded-xl border border-dashed border-fp-border bg-fp-surface/20 p-12 text-center">
        <Icon className="w-10 h-10 text-fp-text-dim mx-auto mb-4" />
        <h3 className="text-sm font-medium text-fp-text">Coming soon</h3>
        <p className="text-xs text-fp-text-dim mt-1 max-w-sm mx-auto">
          This section is under development. Data sources and integrations will be connected here.
        </p>
        {action && (
          <button
            onClick={action.onClick}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-fp-blue text-white text-sm font-medium hover:bg-fp-blue/90 transition-colors"
          >
            {action.label}
          </button>
        )}
      </div>
    </div>
  );
}
