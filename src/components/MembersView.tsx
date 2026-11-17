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
  MemberInvite,
  ProjectMember,
  TaskItem,
  UserRole,
} from '../types/project';
import {
  buildMemberMappingPreview,
  COLLECTIVE_GROUP_LABEL,
  doesTaskMatchExpectedAccount,
  EXPECTED_TBHGN_ACCOUNTS,
  ExpectedAccountSpec,
  formatStandardMemberLabel,
  getExpectedAccountAliases,
  isTemporaryAccountEmail,
  normalizeTextKey,
} from '../utils/memberMapping';
import { isB1TestTask } from '../utils/taskHelpers';

interface MembersViewProps {
  members: ProjectMember[];
  invites: MemberInvite[];
  tasks?: TaskItem[];
  currentUser: ProjectMember;
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
    account: ExpectedAccountSpec,
    matchedMember: ProjectMember
  ) => {
    const key = account.originalName;
    if (assignPreviewKey === key) {
      setAssignPreviewKey(null);
      return;
    }
    const matchingUnlinkedIds = officialActiveTasks
      .filter(
        (t) =>
          doesTaskMatchExpectedAccount(t, account) &&
          !t.assigneeUids.includes(matchedMember.uid)
      )
      .map((t) => t.id);

    setAssignPreviewKey(key);
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
    const safeCanApprove =
      safeRole === 'admin' || safeRole === 'moderator'
        ? true
        : tempEmail
        ? false
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
          <h1 className="text-lg sm:text-2xl font-bold text-huyen-lam tracking-tight">
            Quản lý thành viên
          </h1>
          <p className="text-xs sm:text-sm text-ink-muted mt-0.5">
            Quản lý tài khoản Google đăng nhập, vai trò và ghép nhân sự với danh sách công việc.
          </p>
        </div>

        {isAdmin && (
          <button
            type="button"
            onClick={() => setShowAddForm((v) => !v)}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-huyen-lam text-white text-sm font-medium hover:bg-lam-tri-tue transition-colors whitespace-nowrap shrink-0 min-h-[44px]"
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span>Thêm thành viên</span>
          </button>
        )}
      </div>

      {!isAdmin ? (
        <div className="space-y-4">
          <div className="bg-surface-muted border border-nga-xam rounded-xl px-4 py-3 text-xs sm:text-sm text-huyen-lam/85">
            Chỉ tài khoản có vai trò <strong>Admin</strong> mới được xem danh sách email Google, thêm, khóa hoặc đổi quyền thành viên.
            {currentUser.role === 'moderator'
              ? ' Tài khoản Moderator của bạn quản lý trực tiếp hạng mục tại mục Quản lý hạng mục và điều chỉnh công việc tại mục Công việc.'
              : ''}
          </div>

          <div className="bg-white border border-nga-xam rounded-xl p-4 flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-huyen-lam">
                {currentUser.displayName} (Tài khoản của bạn)
              </div>
              <div className="text-xs text-ink-muted mt-0.5">
                {currentUser.email}
                {currentUser.sheetAlias ? ` · Phụ trách tên: ${currentUser.sheetAlias}` : ''}
              </div>
            </div>
            <div className="text-xs text-huyen-lam/85 flex items-center gap-2 shrink-0">
              <UserCheck className="w-4 h-4 text-huyen-lam shrink-0" />
              <span className="capitalize font-medium">{currentUser.role}</span>
              {(currentUser.canApprove || currentUser.role === 'moderator') && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-minh-kim-ink font-medium">Được duyệt</span>
                </>
              )}
            </div>
          </div>
        </div>
      ) : (
        <>

          {showAddForm && (
            <form
              onSubmit={handleSubmit}
              className="bg-white border border-nga-xam rounded-xl p-4 space-y-3"
            >
              <div className="text-sm font-semibold text-huyen-lam">
                Mời &amp; cấp quyền trước cho email Google
              </div>
              {isEmailTemporary && (
                <div className="p-2.5 bg-minh-kim-soft border border-minh-kim-border rounded-lg text-xs text-minh-kim-ink flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    Email này thuộc danh sách <strong>tài khoản tạm thời</strong>. Hệ thống không tự cấp quyền Admin hoặc quyền phê duyệt; giữ vai trò mặc định là Member.
                  </span>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-medium text-huyen-lam/85 mb-1">
                    Tên hiển thị
                  </label>
                  <input
                    type="text"
                    required
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="VD: Quốc"
                    className="w-full px-3 py-2 text-sm bg-white border border-nga-xam rounded-lg focus:outline-none focus:ring-2 focus:ring-lam-tri-tue min-h-[42px]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-huyen-lam/85 mb-1">
                    Email Google
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => handleEmailChange(e.target.value)}
                    placeholder="ten@gmail.com"
                    className="w-full px-3 py-2 text-sm bg-white border border-nga-xam rounded-lg focus:outline-none focus:ring-2 focus:ring-lam-tri-tue min-h-[42px]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-huyen-lam/85 mb-1">
                    Ghép tên trong công việc
                  </label>
                  <select
                    value={sheetAlias}
                    onChange={(e) => setSheetAlias(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-nga-xam rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-lam-tri-tue min-h-[42px]"
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
                  <label className="block text-xs font-medium text-huyen-lam/85 mb-1">
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
                    className="w-full px-3 py-2 text-sm border border-nga-xam rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-lam-tri-tue min-h-[42px]"
                  >
                    <option value="member">Member (Cập nhật việc được giao)</option>
                    <option value="moderator">Moderator (Quản lý hạng mục &amp; công việc)</option>
                    <option value="viewer">Viewer (Chỉ đọc)</option>
                    <option value="admin" disabled={isEmailTemporary}>
                      Admin (Toàn quyền){isEmailTemporary ? ' — khóa với tài khoản tạm' : ''}
                    </option>
                  </select>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                <label className="inline-flex items-center gap-2 text-xs text-huyen-lam/85 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={
                      role === 'admin' || role === 'moderator'
                        ? true
                        : !isEmailTemporary && canApprove
                    }
                    disabled={role === 'admin' || role === 'moderator' || isEmailTemporary}
                    onChange={(e) => setCanApprove(e.target.checked)}
                    className="w-4 h-4 rounded border-nga-xam accent-huyen-lam"
                  />
                  <span>
                    Cấp quyền phê duyệt công việc hoàn thành (trong phạm vi được giao)
                    {isEmailTemporary && role === 'member' ? ' — tắt với tài khoản tạm' : ''}
                  </span>
                </label>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAddForm(false)}
                    className="px-4 py-2 text-xs font-medium text-ink-muted hover:text-huyen-lam min-h-[40px]"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-4 py-2 text-xs font-medium bg-huyen-lam text-white rounded-lg hover:bg-lam-tri-tue disabled:opacity-50 transition-colors min-h-[40px]"
                  >
                    {submitting ? 'Đang lưu...' : 'Lưu lời mời'}
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* Step 1: Signed-in Accounts -> Confirm Staff Identity & Role */}
          <div className="bg-white border border-nga-xam rounded-xl divide-y divide-nga-xam/60 overflow-hidden">
            <div className="px-4 py-3 bg-nga-thien border-b border-nga-xam space-y-1">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-huyen-lam">
                <span>
                  <span className="text-chu-sa">Bước 1</span> · Xác nhận nhân sự &amp; quyền tài khoản ({members.length})
                </span>
              </div>
              <p className="text-[11px] text-ink-muted">
                Chọn đúng nhân sự dự án để liên kết tên gốc với tài khoản Google và cấp vai trò (chưa tự giao công việc). Sau đó chuyển xuống <strong>Bước 2</strong> bên dưới để xem trước và xác nhận gán từng đầu việc.
              </p>
            </div>
            {members.map((m) => {
              const isSelf = m.uid === currentUser.uid;
              const isTemp = isTemporaryAccountEmail(m.email);
              const matchedSpec = EXPECTED_TBHGN_ACCOUNTS.find((acc) =>
                getExpectedAccountAliases(acc).some(
                  (alias) => normalizeTextKey(alias) === normalizeTextKey(m.sheetAlias)
                )
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
                    !m.isActive ? 'bg-nga-thien opacity-75' : ''
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-huyen-lam">
                        {m.displayName}
                      </span>
                      {isSelf && (
                        <span className="text-[11px] font-medium text-lam-tri-tue">
                          (Bạn)
                        </span>
                      )}
                      {isTemp && (
                        <span className="text-[11px] font-medium text-minh-kim-ink">
                          (Tạm thời)
                        </span>
                      )}
                      {!m.isActive && (
                        <span className="text-[11px] font-medium text-red-700">
                          Đã khóa
                        </span>
                      )}
                      {m.role === 'viewer' && m.isActive && (
                        <span className="text-[11px] font-medium text-minh-kim-ink">
                          · Đang là Viewer (Chỉ đọc)
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-ink-muted mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
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
                          <span className="text-ink-muted/75">Chưa xác nhận nhân sự</span>
                        </>
                      )}
                    </div>
                    {matchedPreviewRow && m.isActive && matchedPreviewRow.readyToConfirmCount > 0 && (
                      <div className="mt-1.5 text-[11px] text-huyen-lam">
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
                      className="col-span-2 sm:col-span-1 px-2.5 py-2 text-xs bg-white border border-nga-xam rounded-lg text-huyen-lam min-h-[42px]"
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
                          ...(nextRole === 'admin' || nextRole === 'moderator'
                            ? { canApprove: true }
                            : isTemp
                            ? { canApprove: false }
                            : {}),
                        });
                      }}
                      className="px-2.5 py-2 text-xs bg-white border border-nga-xam rounded-lg text-huyen-lam disabled:bg-surface-muted min-h-[42px]"
                    >
                      <option value="admin" disabled={isTemp && m.role !== 'admin'}>
                        Admin
                      </option>
                      <option value="moderator">Moderator</option>
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
                        m.canApprove || m.role === 'admin' || m.role === 'moderator'
                          ? 'bg-minh-kim-soft border-minh-kim-border text-minh-kim-ink'
                          : 'bg-white border-nga-xam text-ink-muted hover:bg-nga-thien'
                      }`}
                      disabled={
                        m.role === 'admin' ||
                        m.role === 'moderator' ||
                        (isTemp && !m.canApprove)
                      }
                      title={
                        isTemp && !m.canApprove
                          ? 'Tài khoản tạm thời không tự cấp quyền phê duyệt'
                          : 'Quyền phê duyệt công việc'
                      }
                    >
                      <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        {m.canApprove || m.role === 'admin' || m.role === 'moderator'
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
                      className={`col-span-2 sm:col-span-1 inline-flex items-center justify-center gap-1 px-2.5 py-2 text-xs font-medium rounded-lg border min-h-[42px] disabled:opacity-40 transition-colors ${
                        m.isActive
                          ? 'bg-white border-nga-xam text-huyen-lam/85 hover:bg-red-50 hover:text-red-700 hover:border-red-200'
                          : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      }`}
                    >
                      {m.isActive ? (
                        <>
                          <Lock className="w-3.5 h-3.5 shrink-0" />
                          <span>Khóa</span>
                        </>
                      ) : (
                        <>
                          <Unlock className="w-3.5 h-3.5 shrink-0" />
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
            <div className="bg-white border border-nga-xam rounded-xl divide-y divide-nga-xam/60 overflow-hidden">
              <div className="px-4 py-2.5 bg-nga-thien border-b border-nga-xam text-xs font-semibold text-ink-muted flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 shrink-0" />
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
                        <span className="text-sm font-semibold text-huyen-lam">
                          {inv.displayName}
                        </span>
                        {isTemp && (
                          <span className="text-[11px] font-medium text-minh-kim-ink">
                            (Tạm thời)
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-ink-muted mt-0.5 flex flex-wrap items-center gap-x-2">
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
                            ...(nextRole === 'admin' || nextRole === 'moderator'
                              ? { canApprove: true }
                              : isTemp
                              ? { canApprove: false }
                              : {}),
                          });
                        }}
                        className="px-2.5 py-1.5 text-xs bg-white border border-nga-xam rounded-lg text-huyen-lam min-h-[38px]"
                      >
                        <option value="admin" disabled={isTemp && inv.role !== 'admin'}>
                          Admin
                        </option>
                        <option value="moderator">Moderator</option>
                        <option value="member">Member</option>
                        <option value="viewer">Viewer</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => onDeleteInvite(inv.email)}
                        aria-label={`Thu hồi lời mời ${inv.email}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-red-700 border border-red-200 rounded-lg hover:bg-red-50 min-h-[38px]"
                      >
                        <Trash2 className="w-3.5 h-3.5 shrink-0" />
                        <span>Thu hồi</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* 6 Standardized Project Members & Task Pairing Overview */}
          <div className="bg-white border border-nga-xam rounded-xl overflow-hidden">
            <div className="px-4 py-3 bg-nga-thien border-b border-nga-xam flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-huyen-lam">
                  Danh sách 6 thành viên dự án &amp; đối chiếu công việc
                </h2>
                <p className="text-xs text-ink-muted mt-0.5">
                  Tổng hợp từ {mappingPreview.scopeLabel}. Việc chưa xác nhận tài khoản vẫn giữ nguyên tên phụ trách gốc.
                </p>
              </div>
              <span className="text-xs font-medium text-ink-muted whitespace-nowrap">
                {mappingPreview.signedInExpectedCount}/{EXPECTED_TBHGN_ACCOUNTS.length} đã liên kết tài khoản
              </span>
            </div>

            <div className="p-4 space-y-4">
              {/* Compact Summary Strip */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 bg-nga-thien/60 border border-nga-xam rounded-lg">
                  <div className="text-[11px] text-ink-muted">
                    Thành viên đã có tài khoản
                  </div>
                  <div className="text-base font-bold font-mono-tabular text-huyen-lam mt-0.5">
                    {mappingPreview.signedInExpectedCount} / {EXPECTED_TBHGN_ACCOUNTS.length}
                  </div>
                  <div className="text-[11px] text-ink-muted mt-0.5">
                    {mappingPreview.invitedPendingExpectedCount} đã mời chờ đăng nhập
                  </div>
                </div>

                <div className="p-3 bg-nga-thien/60 border border-nga-xam rounded-lg">
                  <div className="text-[11px] text-ink-muted">
                    Gmail dự kiến tạm thời
                  </div>
                  <div className="text-base font-bold font-mono-tabular text-huyen-lam mt-0.5">
                    {mappingPreview.temporaryExpectedCount} tài khoản
                  </div>
                  <div className="text-[11px] text-ink-muted mt-0.5">
                    Không tự cấp Admin hay quyền duyệt
                  </div>
                </div>

                <div className="p-3 bg-minh-kim-soft/50 border border-minh-kim-border rounded-lg">
                  <div className="text-[11px] text-minh-kim-ink">
                    Công việc chưa liên kết tài khoản
                  </div>
                  <div className="text-base font-bold font-mono-tabular text-minh-kim-ink mt-0.5">
                    {mappingPreview.tasksUnlinkedUidCount} / {mappingPreview.scopeTaskCount}
                  </div>
                  <div className="text-[11px] text-ink-muted mt-0.5">
                    {mappingPreview.tasksWithTextButNoUidCount} việc có tên · {mappingPreview.tasksNoAssigneeAtAllCount} việc chưa phân công
                  </div>
                </div>
              </div>

              {/* Step 2: 6 Standardized Members -> Preview Matching Tasks & Explicitly Confirm UID Assignment */}
              <div className="border border-nga-xam rounded-lg overflow-hidden">
                <div className="px-3.5 py-2.5 bg-nga-thien border-b border-nga-xam space-y-0.5">
                  <div className="text-xs font-semibold text-huyen-lam">
                    <span className="text-chu-sa">Bước 2</span> · Giao công việc cho 6 nhân sự dự án (xem trước &amp; xác nhận gán UID)
                  </div>
                  <p className="text-[11px] text-ink-muted">
                    Admin bấm <strong>Xem &amp; giao việc</strong> trên từng nhân sự đã xác nhận tài khoản để xem các đầu việc có tên gốc tương ứng, chọn các việc muốn gán UID và bấm xác nhận. Tên gốc trên công việc luôn được giữ nguyên.
                  </p>
                </div>
                <div className="divide-y divide-nga-xam/60">
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
                      doesTaskMatchExpectedAccount(t, account)
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
                              <span className="font-semibold text-huyen-lam text-sm">
                                {formatStandardMemberLabel(account)}
                              </span>
                              <span className="font-mono-tabular text-ink-muted break-all">
                                {account.email}
                              </span>
                              <span
                                className={`text-[11px] font-medium ${
                                  account.isTemporary
                                    ? 'text-minh-kim-ink'
                                    : 'text-lam-tri-tue'
                                }`}
                              >
                                ({account.isTemporary ? 'Tạm thời' : 'Chính thức'})
                              </span>
                            </div>
                            <div className="text-[11px] text-ink-muted flex flex-wrap items-center gap-x-2 gap-y-0.5">
                              <span>
                                Công việc mang tên &ldquo;{account.originalName}&rdquo;:{' '}
                                <strong className="text-huyen-lam">
                                  {matchingTaskCodes.length} việc
                                </strong>
                                {matchingTaskCodes.length > 0
                                  ? ` (${matchingTaskCodes.join(', ')})`
                                  : ''}
                              </span>
                              <span aria-hidden="true">·</span>
                              <span>
                                Đã giao tài khoản:{' '}
                                <strong className="text-huyen-lam">
                                  {linkedTaskCodes.length}/{matchingTaskCodes.length}
                                </strong>
                              </span>
                              {matchedMember && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span>
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
                                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
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
                                          account,
                                          matchedMember
                                        )
                                      }
                                      className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium min-h-[40px] transition-colors ${
                                        isPreviewOpen
                                          ? 'bg-huyen-lam text-white border-huyen-lam'
                                          : 'bg-white text-huyen-lam border-huyen-lam hover:bg-nga-thien'
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
                              <span className="inline-flex items-center gap-1.5 text-ink-muted font-medium">
                                <Clock className="w-3.5 h-3.5 shrink-0" />
                                <span>Đã mời · Chờ đăng nhập Google</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 text-minh-kim-ink font-medium">
                                <Link2Off className="w-3.5 h-3.5 shrink-0" />
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
                          <div className="bg-nga-thien border border-nga-xam rounded-lg p-3 space-y-3">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                              <div>
                                <div className="font-semibold text-huyen-lam">
                                  Xem trước các công việc có tên &ldquo;{account.originalName}&rdquo; để giao cho {matchedMember.displayName} ({matchedMember.email})
                                </div>
                                <p className="text-[11px] text-ink-muted mt-0.5">
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
                                    className="text-huyen-lam font-medium hover:text-lam-tri-tue hover:underline"
                                  >
                                    Chọn tất cả chưa gán
                                  </button>
                                  <span aria-hidden="true">·</span>
                                  <button
                                    type="button"
                                    onClick={() => setSelectedTaskIds([])}
                                    className="text-ink-muted hover:text-huyen-lam hover:underline"
                                  >
                                    Bỏ chọn
                                  </button>
                                </div>
                              )}
                            </div>

                            {matchedMember.role === 'viewer' && (
                              <div className="p-2.5 bg-minh-kim-soft border border-minh-kim-border rounded-lg text-[11px] text-minh-kim-ink flex items-start gap-2">
                                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                <span>
                                  Tài khoản này hiện có vai trò <strong>Viewer (Chỉ đọc)</strong>. Sau khi giao việc, bạn cần đổi vai trò lên <strong>Member</strong> ở Bước 1 nếu muốn người này cập nhật tiến độ.
                                </span>
                              </div>
                            )}

                            <div className="bg-white border border-nga-xam rounded-lg divide-y divide-nga-xam/60">
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
                                        : 'hover:bg-nga-thien cursor-pointer'
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
                                        className="mt-0.5 w-4 h-4 rounded border-nga-xam accent-huyen-lam"
                                      />
                                      <div className="min-w-0">
                                        <div className="flex items-baseline gap-1.5 flex-wrap">
                                          <span className="font-mono-tabular font-bold text-huyen-lam">
                                            {task.displayCode}
                                          </span>
                                          <span className="font-medium text-huyen-lam break-words">
                                            {task.title}
                                          </span>
                                        </div>
                                        <div className="text-[11px] text-ink-muted mt-0.5">
                                          Tên gốc: {task.assignees.join(', ')} · Trạng thái: {task.status ?? 'Cần rà soát'}
                                        </div>
                                      </div>
                                    </div>
                                    <span
                                      className={`shrink-0 text-[11px] font-medium ${
                                        alreadyAssigned
                                          ? 'text-emerald-800'
                                          : 'text-minh-kim-ink'
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
                                className="px-3.5 py-2 text-xs font-medium text-ink-muted hover:text-huyen-lam min-h-[40px]"
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
                                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold bg-huyen-lam text-white rounded-lg hover:bg-lam-tri-tue disabled:opacity-50 transition-colors min-h-[42px]"
                                >
                                  <ClipboardCheck className="w-4 h-4 shrink-0" />
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
              <div className="border border-nga-xam rounded-lg overflow-hidden">
                <div className="px-3.5 py-2 bg-nga-thien border-b border-nga-xam text-xs font-semibold text-huyen-lam/85">
                  2. Trạng thái đối chiếu từng thành viên trong {mappingPreview.scopeLabel}
                </div>
                {mappingPreview.aliasRows.length === 0 ? (
                  <div className="p-4 text-xs text-ink-muted">
                    Chưa có tên người thực hiện nào trong danh sách công việc hiện tại.
                  </div>
                ) : (
                  <div className="divide-y divide-nga-xam/60">
                    {mappingPreview.aliasRows.map((row) => (
                      <div
                        key={row.alias}
                        className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                      >
                        <div className="min-w-0 space-y-0.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-huyen-lam">
                              {row.expectedAccount
                                ? formatStandardMemberLabel(row.expectedAccount)
                                : row.alias}
                            </span>
                            <span className="text-ink-muted">
                              ({row.taskCount} việc: {row.taskCodes.join(', ')})
                            </span>
                          </div>
                          <div className="text-[11px] text-ink-muted">
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
                              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                              <span>{row.statusLabel}</span>
                            </span>
                          ) : row.linkStatus === 'ready_to_link' ? (
                            <span className="inline-flex items-center gap-1 text-huyen-lam">
                              <UserCheck className="w-3.5 h-3.5 shrink-0" />
                              <span>
                                {row.statusLabel} ({row.linkedTaskCount}/{row.taskCount})
                              </span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-minh-kim-ink">
                              <Link2Off className="w-3.5 h-3.5 shrink-0" />
                              <span>{row.statusLabel}</span>
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {mappingPreview.collectiveGroupTaskCodes.length > 0 && (
                  <div className="px-3.5 py-2.5 bg-nga-thien border-t border-nga-xam text-xs text-ink-muted flex items-center gap-2">
                    <Users className="w-3.5 h-3.5 text-ink-muted shrink-0" />
                    <span>
                      Nhãn tập thể <strong>&ldquo;{COLLECTIVE_GROUP_LABEL}&rdquo;</strong> (việc{' '}
                      {mappingPreview.collectiveGroupTaskCodes.join(', ')}) là nhóm làm việc chung, không phải tài khoản Google cá nhân.
                    </span>
                  </div>
                )}
              </div>

              <div className="p-3 bg-nga-thien border border-nga-xam rounded-lg text-xs text-ink-muted flex items-start gap-2">
                <Info className="w-4 h-4 shrink-0 mt-0.5 text-huyen-lam" />
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
