'use client';

import { ReactNode, useState, useEffect } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

export default function ErrorBoundary({ children }: ErrorBoundaryProps) {
  const [error, setError] = useState<Error | null>(null);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      console.error('[ERROR_BOUNDARY] Uncaught error:', event.error);
      setError(event.error);
      setHasError(true);
    };

    const handlePromiseRejection = (event: PromiseRejectionEvent) => {
      console.error('[ERROR_BOUNDARY] Unhandled promise rejection:', event.reason);
      setError(new Error(event.reason));
      setHasError(true);
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handlePromiseRejection);

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handlePromiseRejection);
    };
  }, []);

  if (hasError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black text-white p-4">
        <div className="max-w-md bg-red-900 border border-red-700 rounded-lg p-6">
          <h1 className="text-2xl font-bold mb-4 text-red-300">⚠️ Application Error</h1>
          <p className="text-white mb-4">Something went wrong. Please try refreshing the page.</p>
          <details className="bg-red-800 p-3 rounded text-sm mb-4">
            <summary className="cursor-pointer font-semibold mb-2">Error Details</summary>
            <pre className="text-red-100 overflow-auto max-h-40">
              {error?.message}
            </pre>
          </details>
          <button
            onClick={() => {
              setHasError(false);
              setError(null);
              window.location.reload();
            }}
            className="w-full bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded font-semibold"
          >
            Reload Page
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
