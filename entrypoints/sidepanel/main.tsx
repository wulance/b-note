import { createRoot } from 'react-dom/client';
import { Component, type ReactNode } from 'react';
import App from './App';
import './style.css';
import { ensureBrowserFallback } from '@/src/lib/browserFallback';

ensureBrowserFallback();

interface ErrorBoundaryState {
  error: Error | null;
}

class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: unknown) {
    console.error('[b-note] sidepanel crashed', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-white p-4 text-sm text-red-700">
          <h1 className="mb-2 text-base font-semibold">b-note 加载失败</h1>
          <p className="mb-3 text-red-600">{this.state.error.message}</p>
          <button
            onClick={() => location.reload()}
            className="rounded-md bg-red-50 px-3 py-1.5 text-xs font-medium hover:bg-red-100"
          >
            重新加载
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
