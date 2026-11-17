import React, { useState } from 'react';
import {
  Clock,
  Lock,
  Plus,
  ShieldCheck,
  Trash2,
  Unlock,
  UserCheck,
} from 'lucide-react';
import { MemberInvite, ProjectMember, UserRole } from '../types/project';

interface MembersViewProps {
  members: ProjectMember[];
  invites: MemberInvite[];
  currentUser: ProjectMember;
  adminTab?: 'members' | 'categories';
  onChangeAdminTab?: (tab: 'members' | 'categories') => void;
  categoriesPanel?: React.ReactNode;
  onAddInvite: (input: {
    displayName: string;
    email: string;
    role: UserRole;
    canApprove: boolean;
    sheetAlias: string;
  }) => Promise<void>;
  onUpdateMember: (
    uid: string,
    email: string,
    patch: Partial<Pick<ProjectMember, 'role' | 'canApprove' | 'isActive'>>
  ) => Promise<void>;
  onUpdateInvite: (
    email: string,
    patch: Partial<Pick<MemberInvite, 'role' | 'canApprove' | 'isActive'>>
  ) => Promise<void>;
  onDeleteInvite: (email: string) => Promise<void>;
}

export const MembersView: React.FC<MembersViewProps> = ({
  members,
  invites,
  currentUser,
  adminTab = 'members',
  onChangeAdminTab,
  categoriesPanel,
  onAddInvite,
  onUpdateMember,
  onUpdateInvite,
  onDeleteInvite,
}) => {
  const isAdmin = currentUser.role === 'admin' && currentUser.isActive;
  const [showAddForm, setShowAddForm] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [sheetAlias, setSheetAlias] = useState('');
  const [role, setRole] = useState<UserRole>('member');
  const [canApprove, setCanApprove] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const activeEmails = new Set(members.map((m) => m.email.toLowerCase()));
  const pendingInvites = invites.filter(
    (inv) => !activeEmails.has(inv.email.toLowerCase())
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin || !displayName.trim() || !email.trim() || submitting) return;
    setSubmitting(true);
    try {
      await onAddInvite({
        displayName: displayName.trim(),
        email: email.trim().toLowerCase(),
        role,
        canApprove: role === 'admin' ? true : canApprove,
        sheetAlias: sheetAlias.trim() || displayName.trim(),
      });
      setDisplayName('');
      setEmail('');
      setSheetAlias('');
      setRole('member');
      setCanApprove(false);
      setShowAddForm(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-[#13294B] tracking-tight">
            {isAdmin && adminTab === 'categories'
              ? 'Quản trị hệ thống · Hạng mục'
              : 'Quản lý thành viên'}
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
            Chỉ tài khoản Google được quản trị viên phê duyệt mới có quyền truy cập dữ liệu Firestore.
          </p>
        </div>

        {isAdmin && adminTab === 'members' && (
          <button
            type="button"
            onClick={() => setShowAddForm((v) => !v)}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#13294B] text-white text-sm font-medium hover:bg-[#1E3A66] whitespace-nowrap shrink-0 min-h-[44px]"
          >
            <Plus className="w-4 h-4" />
            <span>Thêm thành viên</span>
          </button>
        )}
      </div>

      {isAdmin && onChangeAdminTab && categoriesPanel && (
        <div className="border-b border-slate-200 flex items-center gap-4 text-xs sm:text-sm">
          <button
            type="button"
            onClick={() => onChangeAdminTab('members')}
            className={`py-2.5 border-b-2 font-medium transition-colors whitespace-nowrap ${
              adminTab === 'members'
                ? 'border-[#13294B] text-[#13294B]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Thành viên ({members.length})
          </button>
          <button
            type="button"
            onClick={() => onChangeAdminTab('categories')}
            className={`py-2.5 border-b-2 font-medium transition-colors whitespace-nowrap ${
              adminTab === 'categories'
                ? 'border-[#13294B] text-[#13294B]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Quản lý hạng mục
          </button>
        </div>
      )}

      {!isAdmin ? (
        <div className="space-y-4">
          <div className="bg-slate-100 border border-slate-200 rounded-xl px-4 py-3 text-xs sm:text-sm text-slate-700">
            Chỉ tài khoản có vai trò <strong>Admin</strong> mới được xem danh sách email Google, thêm, khóa hoặc đổi quyền thành viên.
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-900">
                {currentUser.displayName} (Tài khoản của bạn)
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                {currentUser.email}
                {currentUser.sheetAlias ? ` · Tên đối chiếu: ${currentUser.sheetAlias}` : ''}
              </div>
            </div>
            <div className="text-xs text-slate-700 flex items-center gap-2 shrink-0">
              <UserCheck className="w-4 h-4 text-[#13294B]" />
              <span className="capitalize font-medium">{currentUser.role}</span>
              {currentUser.canApprove && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-[#7C4D00]">Được duyệt</span>
                </>
              )}
            </div>
          </div>
        </div>
      ) : adminTab === 'categories' && categoriesPanel ? (
        <>{categoriesPanel}</>
      ) : (
        <>
          {showAddForm && (
            <form
              onSubmit={handleSubmit}
              className="bg-white border border-slate-200 rounded-xl p-4 space-y-3"
            >
              <div className="text-sm font-semibold text-[#13294B]">
                Cấp quyền truy cập cho email Google mới
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Tên hiển thị
                  </label>
                  <input
                    type="text"
                    required
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="VD: Quốc"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#13294B]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Email Google
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="ten@gmail.com"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#13294B]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Tên đối chiếu trong Sheet
                  </label>
                  <input
                    type="text"
                    value={sheetAlias}
                    onChange={(e) => setSheetAlias(e.target.value)}
                    placeholder="VD: Quốc"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#13294B]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Vai trò
                  </label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as UserRole)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#13294B]"
                  >
                    <option value="member">Member (Cập nhật việc được giao)</option>
                    <option value="viewer">Viewer (Chỉ đọc)</option>
                    <option value="admin">Admin (Toàn quyền)</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={role === 'admin' ? true : canApprove}
                    disabled={role === 'admin'}
                    onChange={(e) => setCanApprove(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-[#13294B]"
                  />
                  <span>Cấp quyền phê duyệt công việc hoàn thành (trong phạm vi được giao)</span>
                </label>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAddForm(false)}
                    className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-4 py-2 text-xs font-medium bg-[#13294B] text-white rounded-lg hover:bg-[#1E3A66] disabled:opacity-50"
                  >
                    {submitting ? 'Đang lưu...' : 'Lưu lời mời'}
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* Activated Users */}
          <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
              Thành viên đã kích hoạt ({members.length})
            </div>
            {members.map((m) => {
              const isSelf = m.uid === currentUser.uid;
              return (
                <div
                  key={m.uid}
                  className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    !m.isActive ? 'bg-slate-50 opacity-75' : ''
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-slate-900">
                        {m.displayName}
                      </span>
                      {isSelf && (
                        <span className="text-[11px] font-medium text-[#13294B]">
                          (Bạn)
                        </span>
                      )}
                      {!m.isActive && (
                        <span className="text-[11px] font-medium text-red-700">
                          Đã khóa
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="font-mono-tabular break-all">{m.email}</span>
                      {m.sheetAlias && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>Tên đối chiếu: {m.sheetAlias}</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <select
                      aria-label={`Vai trò của ${m.displayName}`}
                      value={m.role}
                      disabled={isSelf}
                      onChange={(e) =>
                        onUpdateMember(m.uid, m.email, {
                          role: e.target.value as UserRole,
                        })
                      }
                      className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 disabled:bg-slate-100 min-h-[38px]"
                    >
                      <option value="admin">Admin</option>
                      <option value="member">Member</option>
                      <option value="viewer">Viewer</option>
                    </select>

                    <button
                      type="button"
                      onClick={() =>
                        onUpdateMember(m.uid, m.email, {
                          canApprove: !m.canApprove,
                        })
                      }
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border min-h-[38px] transition-colors ${
                        m.canApprove || m.role === 'admin'
                          ? 'bg-[#FFF8E7] border-[#D9A84E] text-[#7C4D00]'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                      disabled={m.role === 'admin'}
                      title="Quyền phê duyệt công việc"
                    >
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>
                        {m.canApprove || m.role === 'admin'
                          ? 'Được duyệt'
                          : 'Không duyệt'}
                      </span>
                    </button>

                    <button
                      type="button"
                      disabled={isSelf}
                      onClick={() =>
                        onUpdateMember(m.uid, m.email, {
                          isActive: !m.isActive,
                        })
                      }
                      className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg border min-h-[38px] disabled:opacity-40 ${
                        m.isActive
                          ? 'bg-white border-slate-200 text-slate-700 hover:bg-red-50 hover:text-red-700 hover:border-red-200'
                          : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      }`}
                    >
                      {m.isActive ? (
                        <>
                          <Lock className="w-3.5 h-3.5" />
                          <span>Khóa</span>
                        </>
                      ) : (
                        <>
                          <Unlock className="w-3.5 h-3.5" />
                          <span>Mở khóa</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pending Google Email Invites */}
          {pendingInvites.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden">
              <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                <span>Chờ đăng nhập Google lần đầu ({pendingInvites.length})</span>
              </div>
              {pendingInvites.map((inv) => (
                <div
                  key={inv.email}
                  className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-900">
                      {inv.displayName}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5 flex flex-wrap items-center gap-x-2">
                      <span className="font-mono-tabular break-all">{inv.email}</span>
                      <span aria-hidden="true">·</span>
                      <span>Tên đối chiếu: {inv.sheetAlias}</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <select
                      aria-label={`Vai trò lời mời ${inv.email}`}
                      value={inv.role}
                      onChange={(e) =>
                        onUpdateInvite(inv.email, {
                          role: e.target.value as UserRole,
                        })
                      }
                      className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 min-h-[38px]"
                    >
                      <option value="admin">Admin</option>
                      <option value="member">Member</option>
                      <option value="viewer">Viewer</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => onDeleteInvite(inv.email)}
                      aria-label={`Thu hồi lời mời ${inv.email}`}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-red-700 border border-red-200 rounded-lg hover:bg-red-50 min-h-[38px]"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Thu hồi</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};
