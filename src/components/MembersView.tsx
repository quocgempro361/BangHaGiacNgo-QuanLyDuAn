import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
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
  normalizeTextKey,
} from '../utils/memberMapping';
import { isB1TestTask } from '../utils/taskHelpers';

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
  onAssignTasksToMember?: (
    member: ProjectMember,
    taskIds: string[]
  ) => Promise<{ updatedCount: number; skippedCount: number }>;
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
  onAssignTasksToMember,
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
  const [assignPreviewKey, setAssignPreviewKey] = useState<string | null>(null);
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [assigningTasks, setAssigningTasks] = useState(false);
  const [assignFeedback, setAssignFeedback] = useState<{
    key: string;
    type: 'success' | 'error';
    text: string;
  } | null>(null);

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

  const officialActiveTasks = useMemo(
    () =>
      tasks
        .filter((t) => !t.archivedAt && !isB1TestTask(t))
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [tasks]
  );

  const openAssignPreview = (
    originalName: string,
    matchedMember: ProjectMember
  ) => {
    if (assignPreviewKey === originalName) {
      setAssignPreviewKey(null);
      return;
    }
    const matchingUnlinkedIds = officialActiveTasks
      .filter(
        (t) =>
          t.assignees.some(
            (a) => normalizeTextKey(a) === normalizeTextKey(originalName)
          ) && !t.assigneeUids.includes(matchedMember.uid)
      )
      .map((t) => t.id);

    setAssignPreviewKey(originalName);
    setSelectedTaskIds(matchingUnlinkedIds);
    setAssignFeedback(null);
  };

  const handleConfirmAssignTasks = async (
    originalName: string,
    matchedMember: ProjectMember
  ) => {
    if (!onAssignTasksToMember || assigningTasks || selectedTaskIds.length === 0) {
      return;
    }
    setAssigningTasks(true);
    setAssignFeedback(null);
    try {
      const res = await onAssignTasksToMember(matchedMember, selectedTaskIds);
      setAssignFeedback({
        key: originalName,
        type: 'success',
        text: `Đã xác nhận giao ${res.updatedCount} công việc cho ${matchedMember.displayName} (giữ nguyên tên gốc trên bảng tính).`,
      });
      setSelectedTaskIds([]);
    } catch (err) {
      setAssignFeedback({
        key: originalName,
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'Không thể giao công việc cho tài khoản này.',
      });
    } finally {
      setAssigningTasks(false);
    }
  };

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
            className={`py-2.5 min-h-[44px] border-b-2 font-medium transition-colors whitespace-nowrap ${
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
              className={`py-2.5 min-h-[44px] border-b-2 font-medium transition-colors whitespace-nowrap ${
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
              className={`py-2.5 min-h-[44px] border-b-2 font-medium transition-colors whitespace-nowrap ${
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

          {/* Step 1: Signed-in Accounts -> Confirm Staff Identity & Role */}
          <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 space-y-1">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-[#13294B]">
                <span>Bước 1 · Xác nhận nhân sự &amp; quyền tài khoản ({members.length})</span>
              </div>
              <p className="text-[11px] text-slate-600">
                Chọn đúng nhân sự dự án để liên kết tên gốc với tài khoản Google và cấp vai trò (chưa tự giao công việc). Sau đó chuyển xuống <strong>Bước 2</strong> bên dưới để xem trước và xác nhận gán từng đầu việc.
              </p>
            </div>
            {members.map((m) => {
              const isSelf = m.uid === currentUser.uid;
              const isTemp = isTemporaryAccountEmail(m.email);
              const matchedSpec = EXPECTED_TBHGN_ACCOUNTS.find(
                (acc) =>
                  acc.originalName.toLowerCase() === m.sheetAlias.trim().toLowerCase()
              );
              const matchedPreviewRow = matchedSpec
                ? mappingPreview.accountRows.find(
                    (r) => r.account.originalName === matchedSpec.originalName
                  )
                : undefined;
              return (
                <div
                  key={m.uid}
                  className={`p-3.5 sm:p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3 ${
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
                        <span className="text-[11px] font-medium text-[#7C4D00]">
                          · Đang là Viewer (Chỉ đọc)
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="font-mono-tabular break-all">{m.email}</span>
                      {matchedSpec ? (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-emerald-800 font-medium">
                            Đã xác nhận nhân sự: {formatStandardMemberLabel(matchedSpec)}
                          </span>
                        </>
                      ) : m.sheetAlias ? (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>Tên đối chiếu: {m.sheetAlias}</span>
                        </>
                      ) : (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-slate-400">Chưa xác nhận nhân sự</span>
                        </>
                      )}
                    </div>
                    {matchedPreviewRow && m.isActive && matchedPreviewRow.readyToConfirmCount > 0 && (
                      <div className="mt-1.5 text-[11px] text-[#13294B]">
                        Có <strong>{matchedPreviewRow.readyToConfirmCount}</strong> công việc mang tên &ldquo;{matchedSpec?.originalName}&rdquo; chưa gán tài khoản này — xác nhận ở Bước 2 bên dưới.
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 shrink-0">
                    <select
                      aria-label={`Xác nhận nhân sự cho ${m.displayName}`}
                      value={matchedSpec ? matchedSpec.originalName : ''}
                      onChange={(e) => {
                        const nextAlias = e.target.value;
                        onUpdateMember(m.uid, m.email, {
                          sheetAlias: nextAlias,
                        });
                      }}
                      className="col-span-2 sm:col-span-1 px-2.5 py-2 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 min-h-[42px]"
                    >
                      <option value="">-- Xác nhận nhân sự --</option>
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
                      className="px-2.5 py-2 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 disabled:bg-slate-100 min-h-[42px]"
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
                      className={`inline-flex items-center justify-center gap-1.5 px-2.5 py-2 text-xs font-medium rounded-lg border min-h-[42px] transition-colors disabled:opacity-50 ${
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
                      <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
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
                      className={`col-span-2 sm:col-span-1 inline-flex items-center justify-center gap-1 px-2.5 py-2 text-xs font-medium rounded-lg border min-h-[42px] disabled:opacity-40 ${
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

              {/* Step 2: 6 Standardized Members -> Preview Matching Tasks & Explicitly Confirm UID Assignment */}
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="px-3.5 py-2.5 bg-slate-50 border-b border-slate-200 space-y-0.5">
                  <div className="text-xs font-semibold text-[#13294B]">
                    Bước 2 · Giao công việc cho 6 nhân sự dự án (xem trước &amp; xác nhận gán UID)
                  </div>
                  <p className="text-[11px] text-slate-600">
                    Admin bấm <strong>Xem &amp; giao việc</strong> trên từng nhân sự đã xác nhận tài khoản để xem các đầu việc có tên gốc tương ứng, chọn các việc muốn gán UID và bấm xác nhận. Tên gốc trên công việc luôn được giữ nguyên.
                  </p>
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
                    const isPreviewOpen = assignPreviewKey === account.originalName;
                    const matchingTasksForPerson = officialActiveTasks.filter((t) =>
                      t.assignees.some(
                        (a) =>
                          normalizeTextKey(a) ===
                          normalizeTextKey(account.originalName)
                      )
                    );
                    const feedbackForRow =
                      assignFeedback?.key === account.originalName
                        ? assignFeedback
                        : null;

                    return (
                      <div key={account.originalName} className="p-3.5 space-y-3 text-xs">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5">
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
                                Đã giao tài khoản:{' '}
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

                          <div className="flex flex-wrap items-center gap-2 shrink-0">
                            {signInStatus === 'signed_in' ? (
                              <>
                                <span className="inline-flex items-center gap-1.5 text-emerald-800 font-medium">
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  <span>
                                    {matchedMember && !matchedMember.isActive
                                      ? 'Đã đăng nhập (Đã khóa)'
                                      : readyToConfirmCount > 0
                                      ? `${readyToConfirmCount} việc chờ giao`
                                      : 'Đã giao đủ việc'}
                                  </span>
                                </span>
                                {matchedMember &&
                                  matchedMember.isActive &&
                                  matchingTasksForPerson.length > 0 &&
                                  onAssignTasksToMember && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        openAssignPreview(
                                          account.originalName,
                                          matchedMember
                                        )
                                      }
                                      className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium min-h-[40px] transition-colors ${
                                        isPreviewOpen
                                          ? 'bg-[#13294B] text-white border-[#13294B]'
                                          : 'bg-white text-[#13294B] border-[#13294B] hover:bg-slate-50'
                                      }`}
                                    >
                                      <ClipboardCheck className="w-3.5 h-3.5 shrink-0" />
                                      <span>
                                        {isPreviewOpen
                                          ? 'Đóng xem trước'
                                          : readyToConfirmCount > 0
                                          ? `Xem & giao việc (${readyToConfirmCount})`
                                          : 'Xem việc đã giao'}
                                      </span>
                                    </button>
                                  )}
                              </>
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

                        {feedbackForRow && (
                          <div
                            className={`p-2.5 rounded-lg border text-xs ${
                              feedbackForRow.type === 'success'
                                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                                : 'bg-red-50 border-red-200 text-red-800'
                            }`}
                          >
                            {feedbackForRow.text}
                          </div>
                        )}

                        {isPreviewOpen && matchedMember && matchedMember.isActive && (
                          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-3">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                              <div>
                                <div className="font-semibold text-[#13294B]">
                                  Xem trước các công việc có tên &ldquo;{account.originalName}&rdquo; để giao cho {matchedMember.displayName} ({matchedMember.email})
                                </div>
                                <p className="text-[11px] text-slate-600 mt-0.5">
                                  Chỉ các công việc bạn tích chọn và bấm xác nhận mới được gán UID. Tên phụ trách gốc và vai trò tài khoản không tự thay đổi.
                                </p>
                              </div>
                              {readyToConfirmCount > 0 && (
                                <div className="flex items-center gap-2 shrink-0 text-[11px]">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setSelectedTaskIds(
                                        matchingTasksForPerson
                                          .filter(
                                            (t) =>
                                              !t.assigneeUids.includes(
                                                matchedMember.uid
                                              )
                                          )
                                          .map((t) => t.id)
                                      )
                                    }
                                    className="text-[#13294B] font-medium hover:underline"
                                  >
                                    Chọn tất cả chưa gán
                                  </button>
                                  <span aria-hidden="true">·</span>
                                  <button
                                    type="button"
                                    onClick={() => setSelectedTaskIds([])}
                                    className="text-slate-600 hover:underline"
                                  >
                                    Bỏ chọn
                                  </button>
                                </div>
                              )}
                            </div>

                            {matchedMember.role === 'viewer' && (
                              <div className="p-2.5 bg-[#FFF8E7] border border-[#D9A84E] rounded-lg text-[11px] text-[#7C4D00] flex items-start gap-2">
                                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                <span>
                                  Tài khoản này hiện có vai trò <strong>Viewer (Chỉ đọc)</strong>. Sau khi giao việc, bạn cần đổi vai trò lên <strong>Member</strong> ở Bước 1 nếu muốn người này cập nhật tiến độ.
                                </span>
                              </div>
                            )}

                            <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-100">
                              {matchingTasksForPerson.map((task) => {
                                const alreadyAssigned = task.assigneeUids.includes(
                                  matchedMember.uid
                                );
                                const isChecked =
                                  alreadyAssigned ||
                                  selectedTaskIds.includes(task.id);
                                return (
                                  <label
                                    key={task.id}
                                    className={`p-2.5 flex items-start justify-between gap-2.5 text-xs ${
                                      alreadyAssigned
                                        ? 'bg-emerald-50/40 cursor-default'
                                        : 'hover:bg-slate-50 cursor-pointer'
                                    }`}
                                  >
                                    <div className="flex items-start gap-2.5 min-w-0">
                                      <input
                                        type="checkbox"
                                        checked={isChecked}
                                        disabled={alreadyAssigned || assigningTasks}
                                        onChange={() => {
                                          if (alreadyAssigned) return;
                                          setSelectedTaskIds((prev) =>
                                            prev.includes(task.id)
                                              ? prev.filter((id) => id !== task.id)
                                              : [...prev, task.id]
                                          );
                                        }}
                                        className="mt-0.5 w-4 h-4 rounded border-slate-300 text-[#13294B]"
                                      />
                                      <div className="min-w-0">
                                        <div className="flex items-baseline gap-1.5 flex-wrap">
                                          <span className="font-mono-tabular font-bold text-[#13294B]">
                                            {task.displayCode}
                                          </span>
                                          <span className="font-medium text-slate-900 break-words">
                                            {task.title}
                                          </span>
                                        </div>
                                        <div className="text-[11px] text-slate-500 mt-0.5">
                                          Tên gốc: {task.assignees.join(', ')} · Trạng thái: {task.status ?? 'Cần rà soát'}
                                        </div>
                                      </div>
                                    </div>
                                    <span
                                      className={`shrink-0 text-[11px] font-medium ${
                                        alreadyAssigned
                                          ? 'text-emerald-800'
                                          : 'text-[#7C4D00]'
                                      }`}
                                    >
                                      {alreadyAssigned ? 'Đã gán UID' : 'Chưa gán UID'}
                                    </span>
                                  </label>
                                );
                              })}
                            </div>

                            <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => setAssignPreviewKey(null)}
                                className="px-3.5 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 min-h-[40px]"
                              >
                                Đóng
                              </button>
                              {readyToConfirmCount > 0 && (
                                <button
                                  type="button"
                                  disabled={
                                    assigningTasks || selectedTaskIds.length === 0
                                  }
                                  onClick={() =>
                                    handleConfirmAssignTasks(
                                      account.originalName,
                                      matchedMember
                                    )
                                  }
                                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold bg-[#13294B] text-white rounded-lg hover:bg-[#1E3A66] disabled:opacity-50 min-h-[42px]"
                                >
                                  <ClipboardCheck className="w-4 h-4" />
                                  <span>
                                    {assigningTasks
                                      ? 'Đang giao công việc...'
                                      : `Xác nhận giao ${selectedTaskIds.length} công việc đã chọn`}
                                  </span>
                                </button>
                              )}
                            </div>
                          </div>
                        )}
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
