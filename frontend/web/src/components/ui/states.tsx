import React from "react";

/** Shimmer skeleton for dark theme. */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`shimmer rounded-xl ${className}`} role="status" aria-label="Loading" />;
}

/** Full-width glass card skeleton. */
export function CardSkeleton() {
  return (
    <div className="space-y-4 glass rounded-[14px] p-6 shadow-lg shadow-black/20">
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-2/3" />
    </div>
  );
}

/** Rich Empty state with glass icon container, standard typography, and action. */
export function EmptyState({
  title,
  message,
  action,
}: {
  title: string;
  message: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 px-6 surface-flat rounded-xl text-center max-w-lg mx-auto">
      <div className="w-16 h-16 rounded-[14px] glass flex items-center justify-center text-fp-blue shadow-md">
        <svg className="h-8 w-8 text-fp-blue" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
      </div>
      <div className="space-y-1">
        <h3 className="text-base font-semibold text-fp-text">{title}</h3>
        <p className="text-sm text-fp-text-muted leading-relaxed">{message}</p>
      </div>
      {action ? (
        <div className="mt-2">{action}</div>
      ) : (
        <div className="mt-2 text-xs text-fp-text-dim uppercase tracking-wide">
          Upload new evidence or run intelligence recon to populate records.
        </div>
      )}
    </div>
  );
}

/** Error state with retry action. */
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 px-6 glass rounded-[14px] text-center max-w-lg mx-auto border-fp-red/30 shadow-lg shadow-black/20">
      <div className="w-16 h-16 rounded-[14px] bg-fp-red/10 border border-fp-red/20 flex items-center justify-center">
        <svg className="h-8 w-8 text-fp-red" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
      </div>
      <div className="space-y-1">
        <h3 className="text-base font-semibold text-fp-text">System Error Encountered</h3>
        <p className="text-sm text-fp-text-muted">{message}</p>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-2 rounded-xl bg-fp-blue/15 border border-fp-blue/30 px-6 py-2.5 text-sm font-semibold text-fp-blue hover:bg-fp-blue/25 hover:shadow-lg transition-all duration-200"
        >
          Retry Connection
        </button>
      )}
    </div>
  );
}
