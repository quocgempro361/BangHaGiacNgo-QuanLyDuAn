import React, { useState } from 'react';
import {
  AlertTriangle,
  Database,
  Download,
  FileJson,
  FolderKanban,
  Shield,
  Users,
} from 'lucide-react';
import { AuthSettings, ProjectMember } from '../types/project';

interface AdminSettingsViewProps {
  currentUser: ProjectMember;
  authSettings: AuthSettings;
  members: ProjectMember[];
  categoriesCount: number;
  tasksCount: number;
  onToggleOpenGoogleLogin: (allowOpen: boolean) => Promise<void>;
  onExportCSV: () => void;
  onExportJSON: () => void;
  onNavigateToCategories: () => void;
  onNavigateToMembers: () => void;
  importPanel: React.ReactNode;
}

export const AdminSettingsView: React.FC<AdminSettingsViewProps> = ({
  currentUser,
  authSettings,
  members,
  categoriesCount,
  tasksCount,
  onToggleOpenGoogleLogin,
  onExportCSV,
  onExportJSON,
  onNavigateToCategories,
  onNavigateToMembers,
  importPanel,
}) => {
  const isAdmin = currentUser.role === 'admin' && currentUser.isActive;
  const [togglingOpenLogin, setTogglingOpenLogin] = useState(false);

  if (!isAdmin) {
    return (
      <div className="bg-surface-muted border border-nga-xam rounded-xl px-4 py-3 text-xs sm:text-sm text-huyen-lam/85">
        Chỉ tài khoản có vai trò <strong>Admin</strong> mới được truy cập Cài đặt quản trị.
      </div>
    );
  }

  const handleToggle = async () => {
    if (togglingOpenLogin) return;
    setTogglingOpenLogin(true);
    try {
      await onToggleOpenGoogleLogin(!authSettings.allowOpenGoogleLogin);
    } finally {
      setTogglingOpenLogin(false);
    }
  };

  const activeCount = members.filter((m) => m.isActive).length;
  const moderatorCount = members.filter(
    (m) => m.isActive && m.role === 'moderator'
  ).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-huyen-lam tracking-tight">
            Cài đặt quản trị
          </h1>
          <p className="text-xs sm:text-sm text-ink-muted mt-0.5">
            Thiết lập đăng nhập hệ thống, sao lưu dữ liệu, nhập dữ liệu dự án và tổng quan phân quyền.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onNavigateToMembers}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-nga-xam text-xs font-medium text-huyen-lam hover:bg-nga-thien transition-colors min-h-[40px]"
          >
            <Users className="w-3.5 h-3.5 shrink-0" />
            <span>Thành viên ({activeCount})</span>
          </button>
          <button
            type="button"
            onClick={onNavigateToCategories}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-nga-xam text-xs font-medium text-huyen-lam hover:bg-nga-thien transition-colors min-h-[40px]"
          >
            <FolderKanban className="w-3.5 h-3.5 shrink-0" />
            <span>Hạng mục ({categoriesCount})</span>
          </button>
        </div>
      </div>

      {/* 1. Open Google Login Toggle */}
      <section className="bg-white border border-nga-xam rounded-xl p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <h2 className="text-sm font-semibold text-huyen-lam">
              Cho phép người mới đăng nhập bằng Google
            </h2>
            <p className="text-xs text-ink-muted">
              {authSettings.allowOpenGoogleLogin
                ? 'Đang BẬT: Mọi tài khoản Google hợp lệ chưa được mời trước sẽ tự vào ở quyền Viewer (Chỉ đọc) để Admin xác nhận nâng quyền sau.'
                : 'Đang TẮT: Chỉ tài khoản đã được Admin mời hoặc đã có trong hệ thống mới đăng nhập được. Tắt không khóa thành viên cũ.'}
            </p>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={authSettings.allowOpenGoogleLogin}
            aria-label="Cho phép người mới đăng nhập bằng Google"
            disabled={togglingOpenLogin}
            onClick={handleToggle}
            className={`inline-flex items-center gap-2.5 px-3 py-2 rounded-lg border text-xs font-semibold transition-colors shrink-0 min-h-[40px] disabled:opacity-50 ${
              authSettings.allowOpenGoogleLogin
                ? 'bg-huyen-lam text-white border-huyen-lam'
                : 'bg-nga-thien text-huyen-lam border-nga-xam hover:bg-surface-muted'
            }`}
          >
            <span
              className={`w-8 h-4 rounded-full relative transition-colors ${
                authSettings.allowOpenGoogleLogin ? 'bg-minh-kim' : 'bg-nga-xam'
              }`}
            >
              <span
                className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${
                  authSettings.allowOpenGoogleLogin ? 'left-4' : 'left-0.5'
                }`}
              />
            </span>
            <span>
              {togglingOpenLogin
                ? 'Đang lưu...'
                : authSettings.allowOpenGoogleLogin
                ? 'Đang BẬT (Viewer)'
                : 'Đang TẮT'}
            </span>
          </button>
        </div>

        {authSettings.allowOpenGoogleLogin && (
          <div className="p-2.5 bg-minh-kim-soft border border-minh-kim-border rounded-lg text-xs text-minh-kim-ink flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              Lưu ý bảo mật: Khi bật chế độ này, bất kỳ tài khoản Gmail hợp lệ nào đều có thể xem dữ liệu công việc ở quyền Chỉ đọc (Viewer), nhưng không thể tạo, sửa, bình luận hay duyệt công việc.
            </span>
          </div>
        )}
      </section>

      {/* 2. System Backup & Role Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
        <section className="bg-white border border-nga-xam rounded-xl p-4 flex flex-col justify-between gap-3">
          <div className="space-y-1">
            <h2 className="text-sm font-semibold text-huyen-lam flex items-center gap-2">
              <Database className="w-4 h-4 text-huyen-lam shrink-0" />
              <span>Sao lưu &amp; xuất dữ liệu hệ thống</span>
            </h2>
            <p className="text-xs text-ink-muted leading-relaxed">
              Xuất dữ liệu công việc ({tasksCount} bản ghi trên Firestore) ra CSV để xem trên bảng tính hoặc xuất JSON đầy đủ (gồm danh mục &amp; cấu trúc trường gốc) dành riêng cho Admin.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              onClick={onExportCSV}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-nga-thien border border-nga-xam text-xs font-medium text-huyen-lam hover:bg-surface-muted transition-colors min-h-[40px]"
            >
              <Download className="w-3.5 h-3.5 shrink-0" />
              <span>Xuất bảng tính CSV</span>
            </button>
            <button
              type="button"
              onClick={onExportJSON}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-huyen-lam text-white text-xs font-medium hover:bg-lam-tri-tue transition-colors min-h-[40px]"
            >
              <FileJson className="w-3.5 h-3.5 shrink-0" />
              <span>Sao lưu JSON (Admin)</span>
            </button>
          </div>
        </section>

        <section className="bg-white border border-nga-xam rounded-xl p-4 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-huyen-lam flex items-center gap-2">
              <Shield className="w-4 h-4 text-minh-kim-ink shrink-0" />
              <span>Phân quyền 4 vai trò hiện tại</span>
            </h2>
            <span className="text-[11px] font-mono-tabular text-ink-muted">
              {moderatorCount} Moderator · {activeCount} hoạt động
            </span>
          </div>
          <ul className="space-y-1.5 text-xs text-huyen-lam/90 leading-relaxed">
            <li>
              <strong>Admin:</strong> Toàn quyền tài khoản thành viên, lời mời, cài đặt hệ thống, hạng mục và mọi công việc.
            </li>
            <li>
              <strong>Moderator:</strong> Thay Admin quản lý hạng mục (thêm/sửa/ẩn/xóa hạng mục chưa dùng) và quản lý, giao việc, phê duyệt tất cả công việc; không sửa tài khoản thành viên hay cài đặt Admin.
            </li>
            <li>
              <strong>Member:</strong> Xem toàn bộ dự án, tạo việc con &amp; cập nhật các công việc được gán UID.
            </li>
            <li>
              <strong>Viewer:</strong> Chỉ xem dữ liệu công việc và góp ý hiện có.
            </li>
          </ul>
        </section>
      </div>

      {/* 3. Project Import & Firestore Verification */}
      <section className="space-y-2.5" aria-label="Nhập dữ liệu dự án">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-sm sm:text-base font-semibold text-huyen-lam">
              Nhập dữ liệu dự án &amp; Đối chiếu Firestore
            </h2>
            <p className="text-xs text-ink-muted">
              Công cụ chỉ dành cho Admin để rà soát hoặc đối chiếu 20 đầu việc chính thức trên Firestore.
            </p>
          </div>
        </div>
        {importPanel}
      </section>
    </div>
  );
};
