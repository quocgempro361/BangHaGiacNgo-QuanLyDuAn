import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ExternalLink,
  Info,
  Users,
  X,
} from 'lucide-react';
import { CategoryItem, ProjectMember, TaskItem, TaskStatus } from '../types/project';
import {
  ALL_STATUSES,
  canUserApproveTask,
  canUserEditTask,
  formatShortDate,
  getEffectiveCategory,
  isB1TestTask,
  isTaskOverdue,
} from '../utils/taskHelpers';
import { StatusBadge } from './StatusBadge';

interface MyTasksViewProps {
  tasks: TaskItem[];
  categories: CategoryItem[];
  currentUser: ProjectMember;
  onSelectTask: (taskId: string) => void;
  onNavigateToTasks?: () => void;
  onQuickUpdate: (
    taskId: string,
    patch: Partial<Pick<TaskItem, 'status' | 'nextStep'>>,
    expectedVersion: number
  ) => Promise<{ ok: boolean; error?: string }>;
}

export const MyTasksView: React.FC<MyTasksViewProps> = ({
  tasks,
  categories,
  currentUser,
  onSelectTask,
  onNavigateToTasks,
  onQuickUpdate,
}) => {
  const [includeGroupTasks, setIncludeGroupTasks] = useState(false);
  const [editingNextStepId, setEditingNextStepId] = useState<string | null>(
    null
  );
  const [nextStepDraft, setNextStepDraft] = useState('');
  const [savingNextStepId, setSavingNextStepId] = useState<string | null>(null);
  const [savingStatusId, setSavingStatusId] = useState<string | null>(null);
  const [quickError, setQuickError] = useState<{
    taskId: string;
    message: string;
  } | null>(null);

  const activeTasks = tasks.filter((t) => !t.archivedAt && !isB1TestTask(t));

  // Strictly separate account-assigned (UID) tasks vs collective "Nhóm" tasks
  const directTasks = activeTasks.filter((t) =>
    t.assigneeUids.includes(currentUser.uid)
  );
  const allCollectiveGroupTasks = activeTasks.filter((t) =>
    t.assignees.includes('Nhóm')
  );
  const visibleGroupTasks = includeGroupTasks
    ? allCollectiveGroupTasks.filter(
        (t) => !t.assigneeUids.includes(currentUser.uid)
      )
    : [];

  const canApprove = canUserApproveTask(currentUser);

  const startEditNextStep = (task: TaskItem) => {
    setEditingNextStepId(task.id);
    setNextStepDraft(task.nextStep ?? '');
    setQuickError(null);
  };

  const cancelEditNextStep = () => {
    if (savingNextStepId) return;
    setEditingNextStepId(null);
    setQuickError(null);
  };

  const commitNextStep = async (task: TaskItem) => {
    if (savingNextStepId) return;
    const trimmed = nextStepDraft.trim();
    if (trimmed === (task.nextStep ?? '').trim()) {
      setEditingNextStepId(null);
      setQuickError(null);
      return;
    }

    setSavingNextStepId(task.id);
    setQuickError(null);
    try {
      const res = await onQuickUpdate(
        task.id,
        { nextStep: trimmed || null },
        task.version
      );
      if (res.ok) {
        setEditingNextStepId(null);
      } else {
        // Keep editingNextStepId and nextStepDraft intact so user input is NEVER lost
        setQuickError({
          taskId: task.id,
          message:
            res.error ||
            'Không thể lưu bước tiếp theo. Nội dung bạn nhập vẫn được giữ lại để thử lại.',
        });
      }
    } finally {
      setSavingNextStepId(null);
    }
  };

  const handleStatusChange = async (task: TaskItem, val: string) => {
    if (savingStatusId) return;
    setSavingStatusId(task.id);
    setQuickError(null);
    try {
      const res = await onQuickUpdate(
        task.id,
        { status: val ? (val as TaskStatus) : null },
        task.version
      );
      if (!res.ok) {
        setQuickError({
          taskId: task.id,
          message: res.error || 'Không thể cập nhật trạng thái công việc.',
        });
      }
    } finally {
      setSavingStatusId(null);
    }
  };

  const renderTaskCard = (task: TaskItem, isCollectiveOnly: boolean) => {
    const canEdit = canUserEditTask(currentUser, task);
    const canApproveThisTask = canUserApproveTask(currentUser, task);
    const statusLockedForNonApprover =
      task.status === 'Hoàn thành' && !canApproveThisTask;
    const effCat = getEffectiveCategory(task, activeTasks, categories);
    const overdue = isTaskOverdue(task);
    const validDriveLinks = task.resultLinks
      .concat(task.referenceLinks)
      .filter((l) => Boolean(l.url));
    const isSavingThisNextStep = savingNextStepId === task.id;
    const isSavingThisStatus = savingStatusId === task.id;
    const taskErr = quickError?.taskId === task.id ? quickError.message : null;

    return (
      <div
        key={task.id}
        className="bg-white border border-slate-200 rounded-xl p-3.5 sm:p-4 space-y-3"
      >
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2.5">
          <button
            type="button"
            onClick={() => onSelectTask(task.id)}
            className="text-left flex-1 min-w-0 group"
          >
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="font-mono-tabular text-xs font-bold text-[#13294B] shrink-0">
                {task.displayCode}
              </span>
              <span className="text-sm sm:text-base font-semibold text-slate-900 group-hover:text-[#13294B] group-hover:underline break-words">
                {task.title}
              </span>
              {isCollectiveOnly && (
                <span className="text-[11px] font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                  Nhóm chung
                </span>
              )}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
              <span>
                {effCat.category || 'Chưa phân hạng mục'}
                {effCat.inherited ? ' (theo nhóm cha)' : ''}
              </span>
              <span aria-hidden="true">·</span>
              <span>
                Phụ trách:{' '}
                {task.assignees.length > 0
                  ? task.assignees.join(', ')
                  : 'Chưa gắn tên'}
              </span>
              {task.dueDate && (
                <>
                  <span aria-hidden="true">·</span>
                  <span
                    className={`font-mono-tabular ${
                      overdue ? 'text-red-700 font-semibold' : ''
                    }`}
                  >
                    Hạn: {formatShortDate(task.dueDate)}
                  </span>
                </>
              )}
            </div>
          </button>

          <div className="flex flex-col items-start sm:items-end gap-1 shrink-0">
            {canEdit && !statusLockedForNonApprover ? (
              <select
                aria-label={`Cập nhật trạng thái cho ${task.title}`}
                value={task.status ?? ''}
                disabled={isSavingThisStatus}
                onChange={(e) => handleStatusChange(task, e.target.value)}
                className="w-full sm:w-auto px-3 py-2 text-xs font-medium bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#13294B] disabled:opacity-60 min-h-[42px]"
              >
                {task.status === null && (
                  <option value="">Cần rà soát (chưa có trạng thái)</option>
                )}
                {ALL_STATUSES.map((st) => {
                  const disabled = st === 'Hoàn thành' && !canApproveThisTask;
                  return (
                    <option key={st} value={st} disabled={disabled}>
                      {st}
                      {disabled ? ' (cần quyền duyệt)' : ''}
                    </option>
                  );
                })}
              </select>
            ) : (
              <>
                <StatusBadge status={task.status} />
                {canEdit && statusLockedForNonApprover && (
                  <span className="text-[11px] text-slate-500">
                    Đã duyệt · cần quyền duyệt để đổi
                  </span>
                )}
              </>
            )}
          </div>
        </div>

        {taskErr && (
          <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{taskErr}</span>
          </div>
        )}

        {/* Quick Next Step Editor */}
        <div className="pt-2.5 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          {editingNextStepId === task.id && canEdit ? (
            <div className="flex-1 flex flex-col sm:flex-row sm:items-center gap-2">
              <input
                type="text"
                maxLength={500}
                value={nextStepDraft}
                disabled={isSavingThisNextStep}
                onChange={(e) => setNextStepDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    commitNextStep(task);
                  }
                  if (e.key === 'Escape') cancelEditNextStep();
                }}
                placeholder="Nhập bước tiếp theo..."
                autoFocus
                className="flex-1 min-w-0 px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#13294B] disabled:bg-slate-50 min-h-[42px]"
              />
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  disabled={isSavingThisNextStep}
                  onClick={() => commitNextStep(task)}
                  className="flex-1 sm:flex-initial px-3.5 py-2 text-xs font-medium bg-[#13294B] text-white rounded-lg inline-flex items-center justify-center gap-1 min-h-[42px] disabled:opacity-60"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{isSavingThisNextStep ? 'Đang lưu...' : 'Lưu'}</span>
                </button>
                <button
                  type="button"
                  disabled={isSavingThisNextStep}
                  onClick={cancelEditNextStep}
                  className="px-3 py-2 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 inline-flex items-center justify-center gap-1 min-h-[42px] disabled:opacity-50"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Hủy</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-between gap-2 text-xs">
              <span className="text-slate-600 break-words">
                <strong className="font-medium text-slate-700">
                  Bước tiếp theo:
                </strong>{' '}
                {task.nextStep || 'Chưa ghi nhận'}
              </span>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => startEditNextStep(task)}
                  className="text-[#13294B] hover:text-[#B8860B] font-medium whitespace-nowrap shrink-0 py-1.5 px-2.5 rounded-lg hover:bg-slate-100 min-h-[36px]"
                >
                  Sửa nhanh
                </button>
              )}
            </div>
          )}

          {validDriveLinks.length > 0 && (
            <a
              href={validDriveLinks[0].url ?? '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium text-[#13294B] hover:underline shrink-0 min-h-[36px]"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Mở tài liệu</span>
            </a>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-[#13294B] tracking-tight">
            Việc của tôi
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
            Tài khoản: <strong className="text-slate-900">{currentUser.displayName}</strong>
            {' · '}
            <span>
              {currentUser.role === 'admin'
                ? 'Quản trị viên'
                : currentUser.role === 'member'
                ? 'Thành viên'
                : 'Viewer (Chỉ đọc)'}
              {canApprove ? ' (Có quyền duyệt)' : ''}
            </span>
          </p>
        </div>

        <label className="inline-flex items-center gap-2 text-xs sm:text-sm text-slate-700 cursor-pointer select-none min-h-[42px]">
          <input
            type="checkbox"
            checked={includeGroupTasks}
            onChange={(e) => setIncludeGroupTasks(e.target.checked)}
            className="w-4 h-4 rounded border-slate-300 text-[#13294B] focus:ring-[#13294B]"
          />
          <span>
            Hiển thị thêm việc chung của nhóm ({allCollectiveGroupTasks.length})
          </span>
        </label>
      </div>

      {currentUser.role === 'viewer' && (
        <div className="bg-slate-100 border border-slate-200 rounded-xl px-4 py-3 text-xs sm:text-sm text-slate-700 flex items-start gap-2.5">
          <Info className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
          <span>
            Tài khoản của bạn đang ở quyền <strong>Viewer (Chỉ đọc)</strong>. Bạn có thể xem tiến độ toàn bộ 20 đầu việc ở mục <strong>Công việc</strong>, nhưng chưa thể chỉnh sửa dữ liệu.
          </span>
        </div>
      )}

      {/* Section 1: Tasks directly assigned to this user's Firebase UID */}
      <section className="space-y-3" aria-label="Việc được giao cho tài khoản của bạn">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xs sm:text-sm font-semibold text-[#13294B]">
            Việc được giao theo tài khoản ({directTasks.length})
          </h2>
          {currentUser.sheetAlias && (
            <span className="text-[11px] text-slate-500">
              Nhân sự đối chiếu: {currentUser.sheetAlias}
            </span>
          )}
        </div>

        {directTasks.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl px-4 py-7 text-center space-y-3">
            <div className="space-y-1 max-w-md mx-auto">
              <p className="text-sm font-semibold text-slate-800">
                Tài khoản của bạn chưa được giao đầu việc riêng nào
              </p>
              <p className="text-xs text-slate-600 leading-relaxed">
                {currentUser.role === 'viewer'
                  ? 'Hiện bạn đang ở quyền Viewer (Chỉ đọc). Bạn vẫn có thể theo dõi toàn bộ dự án tại mục Tổng quan hoặc Công việc.'
                  : currentUser.role === 'admin'
                  ? 'Bạn có thể xem và cập nhật trực tiếp toàn bộ công việc tại mục Công việc, hoặc tự gán tài khoản mình vào các đầu việc cần theo dõi.'
                  : 'Dù tên của bạn có thể đã ghi trên bảng tính nguồn, Admin cần xác nhận giao việc cho tài khoản Google này thì đầu việc mới hiện tại đây để bạn chỉnh sửa.'}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {onNavigateToTasks && (
                <button
                  type="button"
                  onClick={onNavigateToTasks}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-[#13294B] text-white rounded-lg hover:bg-[#1E3A66] min-h-[40px]"
                >
                  <span>Xem tất cả công việc dự án</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
              {allCollectiveGroupTasks.length > 0 && !includeGroupTasks && (
                <button
                  type="button"
                  onClick={() => setIncludeGroupTasks(true)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 min-h-[40px]"
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>Xem {allCollectiveGroupTasks.length} việc chung của nhóm</span>
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {directTasks.map((task) => renderTaskCard(task, false))}
          </div>
        )}
      </section>

      {/* Section 2: Collective "Nhóm" tasks when toggled on */}
      {includeGroupTasks && (
        <section
          className="space-y-2.5 pt-2 border-t border-slate-200"
          aria-label="Việc chung của nhóm"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
            <h2 className="text-xs sm:text-sm font-semibold text-slate-700 flex items-center gap-1.5">
              <Users className="w-4 h-4 text-slate-500" />
              <span>
                Việc chung của nhóm — Nhãn &ldquo;Nhóm&rdquo; ({visibleGroupTasks.length})
              </span>
            </h2>
            <span className="text-[11px] text-slate-500">
              Việc tập thể để theo dõi chung; chỉ tài khoản được Admin gán mới chỉnh sửa trực tiếp.
            </span>
          </div>

          {visibleGroupTasks.length === 0 ? (
            <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-5 text-center text-xs text-slate-500">
              Các việc chung của nhóm đã nằm trong danh sách việc được giao cho tài khoản của bạn.
            </div>
          ) : (
            <div className="space-y-3">
              {visibleGroupTasks.map((task) => renderTaskCard(task, true))}
            </div>
          )}
        </section>
      )}
    </div>
  );
};
