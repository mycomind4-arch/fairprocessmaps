/** Shimmer skeleton for dark theme. */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`shimmer rounded-md ${className}`} role="status" aria-label="Loading" />;
}

/** Full-width glass card skeleton. */
export function CardSkeleton() {
  return (
    <div className="space-y-3 glass rounded-xl p-4">
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-2/3" />
    </div>
  );
}

/** Empty state with glass icon container. */
export function EmptyState({ title, message, action }: { title: string; message: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
      <div className="w-16 h-16 rounded-2xl glass flex items-center justify-center">
        <svg className="h-7 w-7 text-fp-text-dim" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      </div>
      <h3 className="text-sm font-medium text-fp-text">{title}</h3>
      <p className="max-w-sm text-sm text-fp-text-muted">{message}</p>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

/** Error state with retry. */
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
      <div className="w-16 h-16 rounded-2xl bg-fp-red/10 border border-fp-red/20 flex items-center justify-center">
        <svg className="h-7 w-7 text-fp-red" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      </div>
      <p className="text-sm font-medium text-fp-text">Something went wrong</p>
      <p className="max-w-sm text-sm text-fp-text-muted">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="mt-1 rounded-xl bg-fp-blue/15 border border-fp-blue/20 px-4 py-1.5 text-sm font-medium text-fp-blue hover:bg-fp-blue/25 transition-all">
          Try again
        </button>
      )}
    </div>
  );
}
