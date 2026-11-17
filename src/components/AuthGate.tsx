import React, { useState } from 'react';
import { LogOut, RefreshCw, ShieldCheck, ShieldX } from 'lucide-react';
import { AuthResolutionResult } from '../services/firestoreService';
import { TbhgnLogo } from './TbhgnLogo';

interface AuthGateProps {
  loading: boolean;
  authEmail: string | null;
  resolution: AuthResolutionResult | null;
  authError: string | null;
  onSignInPopup: () => Promise<void>;
  onSignInRedirect: () => Promise<void>;
  onBootstrapAdmin: (sheetAlias: string) => Promise<void>;
  onSignOut: () => Promise<void>;
  onRetryCheck: () => Promise<void>;
}

export const AuthGate: React.FC<AuthGateProps> = ({
  loading,
  authEmail,
  resolution,
  authError,
  onSignInPopup,
  onSignInRedirect,
  onBootstrapAdmin,
  onSignOut,
  onRetryCheck,
}) => {
  const [sheetAlias, setSheetAlias] = useState('Admin');
  const [busy, setBusy] = useState(false);

  const handlePopup = async () => {
    setBusy(true);
    try {
      await onSignInPopup();
    } finally {
      setBusy(false);
    }
  };

  const handleBootstrap = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await onBootstrapAdmin(sheetAlias);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-nga-thien flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white border border-nga-xam rounded-2xl overflow-hidden shadow-sm">
        {/* Restrained three-tone editorial seal line */}
        <div className="h-1 flex w-full" aria-hidden="true">
          <div className="flex-1 bg-huyen-lam" />
          <div className="w-16 bg-minh-kim" />
          <div className="w-8 bg-chu-sa" />
        </div>

        <div className="p-6 space-y-5">
          <div className="flex items-center gap-3.5">
            <TbhgnLogo size={40} variant="light" className="shrink-0" />
            <div className="min-w-0">
              <h1 className="text-base font-bold text-huyen-lam tracking-tight">
                Từ Băng Hà Đến Giác Ngộ (TBHGN)
              </h1>
              <p className="text-xs text-ink-muted mt-0.5">
                Hệ thống quản lý tiến độ biên soạn sách
              </p>
            </div>
          </div>

          {authError && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800 break-words">
              {authError}
            </div>
          )}

          {loading ? (
            <div className="py-6 text-center text-sm text-ink-muted">
              Đang kiểm tra phiên đăng nhập và quyền truy cập...
            </div>
          ) : !authEmail ? (
            <div className="space-y-4">
              <p className="text-sm text-slate-700 leading-relaxed">
                Vui lòng đăng nhập bằng tài khoản Google để truy cập tiến độ dự án.
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={handlePopup}
                className="w-full py-2.5 px-4 rounded-xl bg-huyen-lam text-nga-thien text-sm font-semibold hover:bg-lam-tri-tue transition-colors disabled:opacity-50 min-h-[46px]"
              >
                {busy ? 'Đang mở đăng nhập Google...' : 'Đăng nhập bằng Google'}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={onSignInRedirect}
                className="w-full py-2 px-3 rounded-lg border border-nga-xam bg-nga-thien/60 text-xs font-medium text-huyen-lam hover:bg-surface-muted transition-colors min-h-[40px]"
              >
                Trình duyệt di động chặn popup? Thử chuyển hướng Google
              </button>
            </div>
          ) : resolution?.status === 'bootstrap_eligible' ? (
            <form onSubmit={handleBootstrap} className="space-y-4">
              <div className="p-3 rounded-lg bg-minh-kim-soft border border-minh-kim-border text-xs text-minh-kim-ink flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold">
                    Xác minh Quản trị viên đầu tiên
                  </div>
                  <p className="mt-1">
                    Tài khoản <strong>{resolution.email}</strong> khớp với chủ dự án được chỉ định. Thao tác này sẽ xác minh Firebase ID Token phía máy chủ trước khi tạo hồ sơ Admin trong Firestore.
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-huyen-lam mb-1">
                  Tên đối chiếu trong Sheet (nếu có)
                </label>
                <input
                  type="text"
                  value={sheetAlias}
                  onChange={(e) => setSheetAlias(e.target.value)}
                  placeholder="VD: Khánh hoặc Sư phụ"
                  className="w-full px-3 py-2 text-sm bg-nga-thien/40 border border-nga-xam rounded-lg focus:outline-none focus:bg-white focus:ring-2 focus:ring-lam-tri-tue"
                />
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={busy}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-huyen-lam text-nga-thien text-sm font-semibold hover:bg-lam-tri-tue transition-colors disabled:opacity-50 min-h-[44px]"
                >
                  {busy ? 'Đang xác minh...' : 'Khởi tạo Quản trị viên đầu tiên'}
                </button>
                <button
                  type="button"
                  onClick={onSignOut}
                  className="px-3 py-2.5 rounded-xl border border-nga-xam text-xs font-medium text-ink-muted hover:bg-nga-thien hover:text-huyen-lam transition-colors min-h-[44px]"
                >
                  Đăng xuất
                </button>
              </div>
            </form>
          ) : resolution?.status === 'locked' ? (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-sm text-red-900 flex items-start gap-2.5">
                <ShieldX className="w-5 h-5 shrink-0 mt-0.5 text-red-700" />
                <div>
                  <div className="font-semibold">Tài khoản đã bị khóa</div>
                  <p className="text-xs text-red-800 mt-1">
                    Tài khoản <strong>{authEmail}</strong> hiện đang bị tạm khóa quyền đọc và chỉnh sửa dữ liệu. Vui lòng liên hệ quản trị viên.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onSignOut}
                className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-nga-xam text-sm font-medium text-huyen-lam hover:bg-nga-thien transition-colors min-h-[44px]"
              >
                <LogOut className="w-4 h-4 shrink-0" />
                <span>Đăng xuất</span>
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-surface-muted border border-nga-xam text-sm text-huyen-lam flex items-start gap-2.5">
                <ShieldX className="w-5 h-5 shrink-0 mt-0.5 text-ink-muted" />
                <div>
                  <div className="font-semibold">
                    Tài khoản chưa được cấp quyền truy cập
                  </div>
                  <p className="text-xs text-ink-muted mt-1">
                    Tài khoản Google <strong>{authEmail}</strong> chưa được quản trị viên thêm vào danh sách thành viên dự án TBHGN.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onRetryCheck}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-huyen-lam text-nga-thien text-xs font-semibold hover:bg-lam-tri-tue transition-colors min-h-[44px]"
                >
                  <RefreshCw className="w-3.5 h-3.5 shrink-0" />
                  <span>Kiểm tra lại quyền</span>
                </button>
                <button
                  type="button"
                  onClick={onSignOut}
                  className="inline-flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl border border-nga-xam text-xs font-medium text-huyen-lam hover:bg-nga-thien transition-colors min-h-[44px]"
                >
                  <LogOut className="w-3.5 h-3.5 shrink-0" />
                  <span>Đăng xuất</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
