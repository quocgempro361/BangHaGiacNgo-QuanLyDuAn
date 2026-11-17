import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error.message || 'Đã xảy ra lỗi không mong muốn.',
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.hasError) {
      let friendlyMsg = this.state.errorMessage;
      try {
        const parsed = JSON.parse(this.state.errorMessage);
        if (parsed && typeof parsed.error === 'string') {
          if (parsed.error.toLowerCase().includes('permission')) {
            friendlyMsg = `Từ chối quyền truy cập Firestore tại "${parsed.path ?? ''}" (${parsed.operationType ?? ''}).`;
          } else {
            friendlyMsg = parsed.error;
          }
        }
      } catch {
        // Keep raw message if not JSON
      }

      return (
        <div className="min-h-screen bg-nga-thien flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white border border-nga-xam rounded-xl p-6 space-y-4">
            <div className="flex items-center gap-2.5 text-red-700">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <h1 className="text-base font-bold">
                Đã xảy ra lỗi truy cập dữ liệu
              </h1>
            </div>
            <p className="text-sm text-ink-muted break-words">{friendlyMsg}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-huyen-lam text-nga-thien rounded-lg hover:bg-lam-tri-tue transition-colors min-h-[42px]"
            >
              <RotateCcw className="w-4 h-4 shrink-0" />
              <span>Tải lại trang</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
