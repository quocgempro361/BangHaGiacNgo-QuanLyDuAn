import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Info,
  Link2Off,
  Lock,
  Plus,
  ShieldCheck,
  Trash2,
  Unlock,
  UserCheck,
  UserPlus,
} from 'lucide-react';
import { MemberInvite, ProjectMember, TaskItem, UserRole } from '../types/project';
import {
  buildMemberMappingPreview,
  EXPECTED_TBHGN_ACCOUNTS,
  getSafeInviteDefaults,
  isTemporaryAccountEmail,
} from '../utils/memberMapping';

interface MembersViewProps {
  members: ProjectMember[];
  invites: MemberInvite[];
  tasks?: TaskItem[];
  currentUser: ProjectMember;
  adminTab?: 'members' | 'categories' | 'import';
  onChangeAdminTab?: (tab: 'members' | 'categories' | 'import') => void;
  categoriesPanel?: React.ReactNode;
  importPanel?: React.ReactNode;
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
  tasks = [],
  currentUser,
  adminTab = 'members',
  onChangeAdminTab,
  categoriesPanel,
  importPanel,
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

  const isEmailTemporary = isTemporaryAccountEmail(email);

  const mappingPreview = useMemo(
    () =>
      buildMemberMappingPreview(
        EXPECTED_TBHGN_ACCOUNTS,
        members,
        invites,
        tasks
      ),
    [members, invites, tasks]
  );

  const handlePrefillExpectedAccount = (
    account: (typeof EXPECTED_TBHGN_ACCOUNTS)[number]
  ) => {
    const safe = getSafeInviteDefaults(account);
    setDisplayName(safe.displayName);
    setEmail(safe.email);
    setSheetAlias(safe.sheetAlias);
    setRole(safe.role);
    setCanApprove(safe.canApprove);
    setShowAddForm(true);
  };

  const handleEmailChange = (nextEmail: string) => {
    setEmail(nextEmail);
    if (isTemporaryAccountEmail(nextEmail)) {
      if (role === 'admin') setRole('member');
      setCanApprove(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin || !displayName.trim() || !email.trim() || submitting) return;
    const cleanEmail = email.trim().toLowerCase();
    const tempEmail = isTemporaryAccountEmail(cleanEmail);
    const safeRole: UserRole = tempEmail && role === 'admin' ? 'member' : role;
    const safeCanApprove = tempEmail
      ? false
      : safeRole === 'admin'
      ? true
      : canApprove;

    setSubmitting(true);
    try {
      await onAddInvite({
        displayName: displayName.trim(),
        email: cleanEmail,
        role: safeRole,
        canApprove: safeCanApprove,
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
              : isAdmin && adminTab === 'import'
              ? 'Quản trị hệ thống · Nhập dữ liệu dự án'
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

      {isAdmin && onChangeAdminTab && (categoriesPanel || importPanel) && (
        <div className="border-b border-slate-200 flex items-center gap-4 overflow-x-auto text-xs sm:text-sm">
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
          {categoriesPanel && (
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
          )}
          {importPanel && (
            <button
              type="button"
              onClick={() => onChangeAdminTab('import')}
              className={`py-2.5 border-b-2 font-medium transition-colors whitespace-nowrap ${
                adminTab === 'import'
                  ? 'border-[#13294B] text-[#13294B]'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              Nhập dữ liệu dự án
            </button>
          )}
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
      ) : adminTab === 'import' && importPanel ? (
        <>{importPanel}</>
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
              {isEmailTemporary && (
                <div className="p-2.5 bg-[#FFF8E7] border border-[#D9A84E] rounded-lg text-xs text-[#7C4D00] flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    Email này là <strong>tài khoản tạm thời</strong> (B2.3). Hệ thống không tự cấp quyền Admin hoặc quyền phê duyệt; giữ vai trò mặc định là Member.
                  </span>
                </div>
              )}
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
                    onChange={(e) => handleEmailChange(e.target.value)}
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
                    onChange={(e) => {
                      const nextRole = e.target.value as UserRole;
                      if (isEmailTemporary && nextRole === 'admin') return;
                      setRole(nextRole);
                      if (isEmailTemporary) setCanApprove(false);
                    }}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#13294B]"
                  >
                    <option value="member">Member (Cập nhật việc được giao)</option>
                    <option value="viewer">Viewer (Chỉ đọc)</option>
                    <option value="admin" disabled={isEmailTemporary}>
                      Admin (Toàn quyền){isEmailTemporary ? ' — khóa với tài khoản tạm' : ''}
                    </option>
                  </select>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!isEmailTemporary && (role === 'admin' ? true : canApprove)}
                    disabled={role === 'admin' || isEmailTemporary}
                    onChange={(e) => setCanApprove(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-[#13294B]"
                  />
                  <span>
                    Cấp quyền phê duyệt công việc hoàn thành (trong phạm vi được giao)
                    {isEmailTemporary ? ' — tắt với tài khoản tạm' : ''}
                  </span>
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
              const isTemp = isTemporaryAccountEmail(m.email);
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
                      {isTemp && (
                        <span className="text-[11px] font-medium text-[#7C4D00]">
                          (Tài khoản tạm thời)
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
                      <span aria-hidden="true">·</span>
                      <span className="font-mono-tabular text-[11px] text-slate-400 break-all">
                        UID: {m.uid}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <select
                      aria-label={`Vai trò của ${m.displayName}`}
                      value={m.role}
                      disabled={isSelf}
                      onChange={(e) => {
                        const nextRole = e.target.value as UserRole;
                        if (isTemp && nextRole === 'admin') return;
                        onUpdateMember(m.uid, m.email, {
                          role: nextRole,
                          ...(isTemp ? { canApprove: false } : {}),
                        });
                      }}
                      className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 disabled:bg-slate-100 min-h-[38px]"
                    >
                      <option value="admin" disabled={isTemp && m.role !== 'admin'}>
                        Admin
                      </option>
                      <option value="member">Member</option>
                      <option value="viewer">Viewer</option>
                    </select>

                    <button
                      type="button"
                      onClick={() => {
                        if (isTemp && !m.canApprove) return;
                        onUpdateMember(m.uid, m.email, {
                          canApprove: !m.canApprove,
                        });
                      }}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border min-h-[38px] transition-colors disabled:opacity-50 ${
                        m.canApprove || m.role === 'admin'
                          ? 'bg-[#FFF8E7] border-[#D9A84E] text-[#7C4D00]'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                      disabled={m.role === 'admin' || (isTemp && !m.canApprove)}
                      title={
                        isTemp && !m.canApprove
                          ? 'Tài khoản tạm thời không tự cấp quyền phê duyệt'
                          : 'Quyền phê duyệt công việc'
                      }
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
              {pendingInvites.map((inv) => {
                const isTemp = isTemporaryAccountEmail(inv.email);
                return (
                  <div
                    key={inv.email}
                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-slate-900">
                          {inv.displayName}
                        </span>
                        {isTemp && (
                          <span className="text-[11px] font-medium text-[#7C4D00]">
                            (Tài khoản tạm thời)
                          </span>
                        )}
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
                        onChange={(e) => {
                          const nextRole = e.target.value as UserRole;
                          if (isTemp && nextRole === 'admin') return;
                          onUpdateInvite(inv.email, {
                            role: nextRole,
                            ...(isTemp ? { canApprove: false } : {}),
                          });
                        }}
                        className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 min-h-[38px]"
                      >
                        <option value="admin" disabled={isTemp && inv.role !== 'admin'}>
                          Admin
                        </option>
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
                );
              })}
            </div>
          )}

          {/* Stage B2.3: Member Mapping Preparation & Preview (Read-only, NO bulk assignment) */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-[#13294B]">
                  Chuẩn bị &amp; Xem trước ánh xạ thành viên (Giai đoạn B2.3)
                </h2>
                <p className="text-xs text-slate-600 mt-0.5">
                  Đối chiếu danh sách tài khoản dự kiến với {mappingPreview.scopeLabel}. Chỉ ánh xạ UID sau khi tài khoản đã đăng nhập và Admin xác nhận.
                </p>
              </div>
              <span className="text-[11px] font-medium text-[#13294B] whitespace-nowrap">
                Chỉ xem trước · Chưa gán UID hàng loạt
              </span>
            </div>

            <div className="p-4 space-y-4">
              {/* Guardrail & Workflow Notice */}
              <div className="p-3 bg-[#FFF8E7] border border-[#D9A84E] rounded-lg text-xs text-[#7C4D00] flex items-start gap-2.5">
                <Info className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="font-semibold">
                    Nguyên tắc bảo toàn dữ liệu B2.3
                  </div>
                  <p>
                    Dừng ở bước chuẩn bị &amp; xem trước ánh xạ. Công việc chưa gắn Firebase UID giữ nguyên trạng thái{' '}
                    <strong>“Chưa liên kết tài khoản”</strong>. Tài khoản tạm thời không được tự cấp Admin hay quyền phê duyệt. Khi chuyển sang tài khoản chính thức sau này, Admin chỉ cần gán UID mới và bỏ tích UID cũ trong chi tiết từng công việc — toàn bộ trạng thái, liên kết nghiên cứu và lịch sử cập nhật vẫn giữ nguyên.
                  </p>
                </div>
              </div>

              {/* Compact Summary Strip */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 border border-slate-200 rounded-lg">
                  <div className="text-[11px] text-slate-500">
                    Tài khoản dự kiến đã đăng nhập
                  </div>
                  <div className="text-base font-bold font-mono-tabular text-[#13294B] mt-0.5">
                    {mappingPreview.signedInExpectedCount} / {EXPECTED_TBHGN_ACCOUNTS.length}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {mappingPreview.invitedPendingExpectedCount} đã mời chờ đăng nhập
                  </div>
                </div>

                <div className="p-3 border border-slate-200 rounded-lg">
                  <div className="text-[11px] text-slate-500">
                    Tài khoản tạm thời (B2.3)
                  </div>
                  <div className="text-base font-bold font-mono-tabular text-slate-900 mt-0.5">
                    {mappingPreview.temporaryExpectedCount} tài khoản
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Mặc định Member · không quyền duyệt
                  </div>
                </div>

                <div className="p-3 border border-slate-200 rounded-lg">
                  <div className="text-[11px] text-slate-500">
                    Việc ở trạng thái Chưa liên kết tài khoản
                  </div>
                  <div className="text-base font-bold font-mono-tabular text-[#7C4D00] mt-0.5">
                    {mappingPreview.tasksUnlinkedUidCount} / {mappingPreview.scopeTaskCount}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {mappingPreview.tasksWithTextButNoUidCount} việc có tên text · {mappingPreview.tasksNoAssigneeAtAllCount} việc chưa phân công
                  </div>
                </div>
              </div>

              {/* Expected Accounts Checklist */}
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="px-3.5 py-2 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-700">
                  1. Danh sách tài khoản dự kiến (5 tài khoản)
                </div>
                <div className="divide-y divide-slate-100">
                  {mappingPreview.accountRows.map((row) => {
                    const { account, signInStatus, matchedMember, matchingTaskCodes, linkedTaskCodes, readyToConfirmCount, hasPrivilegeWarning } = row;
                    return (
                      <div
                        key={account.email}
                        className="p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-2.5 text-xs"
                      >
                        <div className="min-w-0 space-y-0.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-slate-900 text-sm">
                              {account.displayName}
                            </span>
                            <span className="font-mono-tabular text-slate-600 break-all">
                              {account.email}
                            </span>
                            <span
                              className={`text-[11px] font-medium ${
                                account.isTemporary
                                  ? 'text-[#7C4D00]'
                                  : 'text-[#13294B]'
                              }`}
                            >
                              ({account.isTemporary ? 'Tạm thời' : 'Chính thức'})
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                            <span>
                              Khớp tên trong dữ liệu:{' '}
                              <strong className="text-slate-700">
                                {matchingTaskCodes.length} việc
                              </strong>
                              {matchingTaskCodes.length > 0
                                ? ` (${matchingTaskCodes.join(', ')})`
                                : ''}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>
                              Đã gắn UID:{' '}
                              <strong className="text-slate-700">
                                {linkedTaskCodes.length}/{matchingTaskCodes.length}
                              </strong>
                            </span>
                            {matchedMember && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="font-mono-tabular text-slate-500 break-all">
                                  UID: {matchedMember.uid} ({matchedMember.role}
                                  {matchedMember.canApprove ? ', Được duyệt' : ''})
                                </span>
                              </>
                            )}
                          </div>
                          {hasPrivilegeWarning && (
                            <div className="text-[11px] text-red-700 font-medium">
                              Cảnh báo: Tài khoản tạm đang có quyền Admin hoặc Duyệt — nên hạ về Member và tắt quyền duyệt.
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {signInStatus === 'signed_in' ? (
                            <span className="inline-flex items-center gap-1.5 text-emerald-800 font-medium">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>
                                {matchedMember && !matchedMember.isActive
                                  ? 'Đã đăng nhập (Đã khóa)'
                                  : readyToConfirmCount > 0
                                  ? `Đã đăng nhập · ${readyToConfirmCount} việc chờ Admin xác nhận`
                                  : 'Đã đăng nhập'}
                              </span>
                            </span>
                          ) : signInStatus === 'invited_pending' ? (
                            <span className="inline-flex items-center gap-1.5 text-slate-600 font-medium">
                              <Clock className="w-3.5 h-3.5" />
                              <span>Đã mời · Chờ đăng nhập (chưa có UID)</span>
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handlePrefillExpectedAccount(account)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-lg bg-white text-[#13294B] hover:bg-slate-50"
                            >
                              <UserPlus className="w-3.5 h-3.5" />
                              <span>Điền sẵn mời (Member)</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Alias -> UID Mapping Preview Table */}
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="px-3.5 py-2 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-700">
                  2. Xem trước đối chiếu tên thực hiện trong công việc ↔ Firebase UID ({mappingPreview.aliasRows.length} tên)
                </div>
                {mappingPreview.aliasRows.length === 0 ? (
                  <div className="p-4 text-xs text-slate-500">
                    Chưa có tên người thực hiện nào trong danh sách công việc hiện tại.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {mappingPreview.aliasRows.map((row) => (
                      <div
                        key={row.alias}
                        className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                      >
                        <div className="min-w-0 space-y-0.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-slate-900">
                              {row.alias}
                            </span>
                            <span className="text-slate-500">
                              ({row.taskCount} việc: {row.taskCodes.join(', ')})
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {row.matchedMembers.length > 0 ? (
                              <span>
                                Tài khoản khớp:{' '}
                                {row.matchedMembers
                                  .map((m) => `${m.email} (${m.uid})`)
                                  .join('; ')}
                              </span>
                            ) : row.matchedPendingInvites.length > 0 ? (
                              <span>
                                Đã gửi lời mời tới{' '}
                                {row.matchedPendingInvites
                                  .map((i) => i.email)
                                  .join(', ')}{' '}
                                — chờ đăng nhập Google lần đầu để lấy UID.
                              </span>
                            ) : row.expectedAccount ? (
                              <span>
                                Dự kiến tài khoản: {row.expectedAccount.email} — chưa đăng nhập, giữ nguyên tên hiển thị.
                              </span>
                            ) : (
                              <span>
                                Chưa có tài khoản Google tương ứng — giữ nguyên tên hiển thị gốc.
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="shrink-0 flex items-center gap-1.5 font-medium">
                          {row.linkStatus === 'linked' ? (
                            <span className="inline-flex items-center gap-1 text-emerald-800">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>{row.statusLabel}</span>
                            </span>
                          ) : row.linkStatus === 'ready_to_link' ? (
                            <span className="inline-flex items-center gap-1 text-[#13294B]">
                              <UserCheck className="w-3.5 h-3.5" />
                              <span>
                                {row.statusLabel} ({row.linkedTaskCount}/{row.taskCount})
                              </span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[#7C4D00]">
                              <Link2Off className="w-3.5 h-3.5" />
                              <span>{row.statusLabel}</span>
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

