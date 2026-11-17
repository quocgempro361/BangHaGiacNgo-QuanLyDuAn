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
  Users,
} from 'lucide-react';
import {
  AuthSettings,
  MemberInvite,
  ProjectMember,
  TaskItem,
  UserRole,
} from '../types/project';
import {
  buildMemberMappingPreview,
  COLLECTIVE_GROUP_LABEL,
  EXPECTED_TBHGN_ACCOUNTS,
  formatStandardMemberLabel,
  isTemporaryAccountEmail,
} from '../utils/memberMapping';

interface MembersViewProps {
  members: ProjectMember[];
  invites: MemberInvite[];
  tasks?: TaskItem[];
  currentUser: ProjectMember;
  authSettings?: AuthSettings;
  adminTab?: 'members' | 'categories' | 'import';
  onChangeAdminTab?: (tab: 'members' | 'categories' | 'import') => void;
  categoriesPanel?: React.ReactNode;
  importPanel?: React.ReactNode;
  onToggleOpenGoogleLogin?: (allowOpen: boolean) => Promise<void>;
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
    patch: Partial<
      Pick<ProjectMember, 'role' | 'canApprove' | 'isActive' | 'sheetAlias' | 'displayName'>
    >
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
  authSettings = { allowOpenGoogleLogin: false },
  adminTab = 'members',
  onChangeAdminTab,
  categoriesPanel,
  importPanel,
  onToggleOpenGoogleLogin,
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
  const [togglingOpenLogin, setTogglingOpenLogin] = useState(false);

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

  const handleToggleOpenLogin = async () => {
    if (!isAdmin || !onToggleOpenGoogleLogin || togglingOpenLogin) return;
    setTogglingOpenLogin(true);
    try {
      await onToggleOpenGoogleLogin(!authSettings.allowOpenGoogleLogin);
    } finally {
      setTogglingOpenLogin(false);
    }
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
        sheetAlias: sheetAlias.trim(),
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
            Quản lý tài khoản Google đăng nhập, vai trò và ghép thành viên với danh sách công việc.
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
                {currentUser.sheetAlias ? ` · Phụ trách tên: ${currentUser.sheetAlias}` : ''}
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
          {/* Admin-only Open Google Login Setting */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="text-sm font-semibold text-[#13294B]">
                  Cho phép người mới đăng nhập bằng Google
                </div>
                <p className="text-xs text-slate-600">
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
                onClick={handleToggleOpenLogin}
                className={`inline-flex items-center gap-2.5 px-3 py-2 rounded-lg border text-xs font-semibold transition-colors shrink-0 min-h-[40px] disabled:opacity-50 ${
                  authSettings.allowOpenGoogleLogin
                    ? 'bg-[#13294B] text-white border-[#13294B]'
                    : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'
                }`}
              >
                <span
                  className={`w-8 h-4 rounded-full relative transition-colors ${
                    authSettings.allowOpenGoogleLogin ? 'bg-[#C59B27]' : 'bg-slate-300'
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
              <div className="p-2.5 bg-[#FFF8E7] border border-[#D9A84E] rounded-lg text-xs text-[#7C4D00] flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  Lưu ý bảo mật: Khi bật chế độ này, bất kỳ tài khoản Gmail hợp lệ nào đều có thể xem dữ liệu công việc ở quyền Chỉ đọc (Viewer), nhưng không thể tạo, sửa, bình luận hay duyệt công việc.
                </span>
              </div>
            )}
          </div>

          {showAddForm && (
            <form
              onSubmit={handleSubmit}
              className="bg-white border border-slate-200 rounded-xl p-4 space-y-3"
            >
              <div className="text-sm font-semibold text-[#13294B]">
                Mời &amp; cấp quyền trước cho email Google
              </div>
              {isEmailTemporary && (
                <div className="p-2.5 bg-[#FFF8E7] border border-[#D9A84E] rounded-lg text-xs text-[#7C4D00] flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    Email này thuộc danh sách <strong>tài khoản tạm thời</strong>. Hệ thống không tự cấp quyền Admin hoặc quyền phê duyệt; giữ vai trò mặc định là Member.
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
                    Ghép tên trong công việc
                  </label>
                  <select
                    value={sheetAlias}
                    onChange={(e) => setSheetAlias(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#13294B]"
                  >
                    <option value="">-- Chưa ghép --</option>
                    {EXPECTED_TBHGN_ACCOUNTS.map((acc) => (
                      <option key={acc.originalName} value={acc.originalName}>
                        {formatStandardMemberLabel(acc)}
                      </option>
                    ))}
                  </select>
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

          {/* Signed-in Accounts: Role, Active Status & 1-click Pairing to 6 Project People */}
          <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600 flex items-center justify-between gap-2">
              <span>Tài khoản đã đăng nhập ({members.length})</span>
              <span className="font-normal text-slate-500">
                Chọn người dự án tương ứng để ghép &amp; nâng quyền từ Viewer lên Member
              </span>
            </div>
            {members.map((m) => {
              const isSelf = m.uid === currentUser.uid;
              const isTemp = isTemporaryAccountEmail(m.email);
              const matchedSpec = EXPECTED_TBHGN_ACCOUNTS.find(
                (acc) =>
                  acc.originalName.toLowerCase() === m.sheetAlias.trim().toLowerCase()
              );
              return (
                <div
                  key={m.uid}
                  className={`p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3 ${
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
                          (Tạm thời)
                        </span>
                      )}
                      {!m.isActive && (
                        <span className="text-[11px] font-medium text-red-700">
                          Đã khóa
                        </span>
                      )}
                      {m.role === 'viewer' && m.isActive && (
                        <span className="text-[11px] font-medium text-slate-500">
                          · Chỉ đọc (chờ nâng quyền)
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="font-mono-tabular break-all">{m.email}</span>
                      {matchedSpec ? (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-emerald-800 font-medium">
                            Đã ghép: {formatStandardMemberLabel(matchedSpec)}
                          </span>
                        </>
                      ) : m.sheetAlias ? (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>Tên đối chiếu: {m.sheetAlias}</span>
                        </>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <select
                      aria-label={`Ghép thành viên dự án cho ${m.displayName}`}
                      value={matchedSpec ? matchedSpec.originalName : ''}
                      onChange={(e) => {
                        const nextAlias = e.target.value;
                        onUpdateMember(m.uid, m.email, {
                          sheetAlias: nextAlias,
                        });
                      }}
                      className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 min-h-[38px]"
                    >
                      <option value="">-- Ghép người dự án --</option>
                      {EXPECTED_TBHGN_ACCOUNTS.map((acc) => (
                        <option key={acc.originalName} value={acc.originalName}>
                          {formatStandardMemberLabel(acc)}
                        </option>
                      ))}
                    </select>

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
                <span>Đã mời trước · Chờ đăng nhập Google ({pendingInvites.length})</span>
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
                            (Tạm thời)
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5 flex flex-wrap items-center gap-x-2">
                        <span className="font-mono-tabular break-all">{inv.email}</span>
                        {inv.sheetAlias && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>Ghép: {inv.sheetAlias}</span>
                          </>
                        )}
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

          {/* 6 Standardized Project Members & Task Pairing Overview */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-[#13294B]">
                  Danh sách 6 thành viên dự án &amp; đối chiếu công việc
                </h2>
                <p className="text-xs text-slate-600 mt-0.5">
                  Tổng hợp từ {mappingPreview.scopeLabel}. Việc chưa xác nhận tài khoản vẫn giữ nguyên tên phụ trách gốc.
                </p>
              </div>
              <span className="text-xs font-medium text-slate-600 whitespace-nowrap">
                {mappingPreview.signedInExpectedCount}/{EXPECTED_TBHGN_ACCOUNTS.length} đã liên kết tài khoản
              </span>
            </div>

            <div className="p-4 space-y-4">
              {/* Compact Summary Strip */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 border border-slate-200 rounded-lg">
                  <div className="text-[11px] text-slate-500">
                    Thành viên đã có tài khoản
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
                    Gmail dự kiến tạm thời
                  </div>
                  <div className="text-base font-bold font-mono-tabular text-slate-900 mt-0.5">
                    {mappingPreview.temporaryExpectedCount} tài khoản
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Không tự cấp Admin hay quyền duyệt
                  </div>
                </div>

                <div className="p-3 border border-slate-200 rounded-lg">
                  <div className="text-[11px] text-slate-500">
                    Công việc chưa liên kết tài khoản
                  </div>
                  <div className="text-base font-bold font-mono-tabular text-[#7C4D00] mt-0.5">
                    {mappingPreview.tasksUnlinkedUidCount} / {mappingPreview.scopeTaskCount}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {mappingPreview.tasksWithTextButNoUidCount} việc có tên · {mappingPreview.tasksNoAssigneeAtAllCount} việc chưa phân công
                  </div>
                </div>
              </div>

              {/* 6 Standardized Members List */}
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="px-3.5 py-2 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-700">
                  1. 6 thành viên trong dự án (giữ nguyên tên gốc trên công việc)
                </div>
                <div className="divide-y divide-slate-100">
                  {mappingPreview.accountRows.map((row) => {
                    const {
                      account,
                      signInStatus,
                      matchedMember,
                      matchingTaskCodes,
                      linkedTaskCodes,
                      readyToConfirmCount,
                      hasPrivilegeWarning,
                    } = row;
                    return (
                      <div
                        key={account.originalName}
                        className="p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-2.5 text-xs"
                      >
                        <div className="min-w-0 space-y-0.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-slate-900 text-sm">
                              {formatStandardMemberLabel(account)}
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
                              Công việc mang tên &ldquo;{account.originalName}&rdquo;:{' '}
                              <strong className="text-slate-700">
                                {matchingTaskCodes.length} việc
                              </strong>
                              {matchingTaskCodes.length > 0
                                ? ` (${matchingTaskCodes.join(', ')})`
                                : ''}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>
                              Đã xác nhận quyền sửa:{' '}
                              <strong className="text-slate-700">
                                {linkedTaskCodes.length}/{matchingTaskCodes.length}
                              </strong>
                            </span>
                            {matchedMember && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="text-slate-600">
                                  Tài khoản: {matchedMember.email} ({matchedMember.role}
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
                                  ? `Đã đăng nhập · ${readyToConfirmCount} việc chờ xác nhận`
                                  : 'Đã đăng nhập & ghép đủ'}
                              </span>
                            </span>
                          ) : signInStatus === 'invited_pending' ? (
                            <span className="inline-flex items-center gap-1.5 text-slate-600 font-medium">
                              <Clock className="w-3.5 h-3.5" />
                              <span>Đã mời · Chờ đăng nhập Google</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-[#7C4D00] font-medium">
                              <Link2Off className="w-3.5 h-3.5" />
                              <span>Chưa liên kết tài khoản</span>
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Alias -> Account Overview + Separate Collective "Nhóm" Note */}
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="px-3.5 py-2 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-700">
                  2. Trạng thái đối chiếu từng thành viên trong {mappingPreview.scopeLabel}
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
                              {row.expectedAccount
                                ? formatStandardMemberLabel(row.expectedAccount)
                                : row.alias}
                            </span>
                            <span className="text-slate-500">
                              ({row.taskCount} việc: {row.taskCodes.join(', ')})
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {row.matchedMembers.length > 0 ? (
                              <span>
                                Tài khoản đã ghép:{' '}
                                {row.matchedMembers
                                  .map((m) => m.email)
                                  .join(', ')}
                              </span>
                            ) : row.matchedPendingInvites.length > 0 ? (
                              <span>
                                Đã mời{' '}
                                {row.matchedPendingInvites
                                  .map((i) => i.email)
                                  .join(', ')}{' '}
                                — chờ đăng nhập lần đầu.
                              </span>
                            ) : row.expectedAccount ? (
                              <span>
                                Gmail dự kiến: {row.expectedAccount.email} — chưa liên kết tài khoản.
                              </span>
                            ) : (
                              <span>
                                Chưa có tài khoản tương ứng — giữ nguyên tên gốc.
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

                {mappingPreview.collectiveGroupTaskCodes.length > 0 && (
                  <div className="px-3.5 py-2.5 bg-slate-50 border-t border-slate-200 text-xs text-slate-600 flex items-center gap-2">
                    <Users className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    <span>
                      Nhãn tập thể <strong>&ldquo;{COLLECTIVE_GROUP_LABEL}&rdquo;</strong> (việc{' '}
                      {mappingPreview.collectiveGroupTaskCodes.join(', ')}) là nhóm làm việc chung, không phải tài khoản Google cá nhân.
                    </span>
                  </div>
                )}
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600 flex items-start gap-2">
                <Info className="w-4 h-4 shrink-0 mt-0.5 text-slate-500" />
                <span>
                  Khi muốn thay đổi người phụ trách sang tài khoản Google chính thức sau này, Admin mở chi tiết công việc, tích chọn tài khoản mới và bỏ tích tài khoản cũ — toàn bộ trạng thái, liên kết tài liệu và lịch sử cập nhật vẫn được giữ nguyên.
                </span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
