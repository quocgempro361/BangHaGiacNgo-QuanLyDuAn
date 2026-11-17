import React, { useState } from 'react';
import { Check, ExternalLink, Info } from 'lucide-react';
import { CategoryItem, ProjectMember, TaskItem, TaskStatus } from '../types/project';
import {
  ALL_STATUSES,
  canUserApproveTask,
  canUserEditTask,
  formatShortDate,
  getEffectiveCategory,
  isTaskOverdue,
} from '../utils/taskHelpers';
import { StatusBadge } from './StatusBadge';

interface MyTasksViewProps {
  tasks: TaskItem[];
  categories: CategoryItem[];
  currentUser: ProjectMember;
  onSelectTask: (taskId: string) => void;
  onQuickUpdate: (
    taskId: string,
    patch: Partial<Pick<TaskItem, 'status' | 'nextStep'>>,
    expectedVersion: number
  ) => Promise<void>;
}

export const MyTasksView: React.FC<MyTasksViewProps> = ({
  tasks,
  categories,
  currentUser,
  onSelectTask,
  onQuickUpdate,
}) => {
  const [includeGroupTasks, setIncludeGroupTasks] = useState(false);
  const [editingNextStepId, setEditingNextStepId] = useState<string | null>(
    null
  );
  const [nextStepDraft, setNextStepDraft] = useState('');

  const activeTasks = tasks.filter((t) => !t.archivedAt);

  // Primary filter: strictly Firebase UID; optional toggle shows text-labeled "Nhóm" items for visibility only
  const myTasks = activeTasks.filter((t) => {
    const isDirectUid = t.assigneeUids.includes(currentUser.uid);
    const isGroupLabel = includeGroupTasks && t.assignees.includes('Nhóm');
    return isDirectUid || isGroupLabel;
  });

  const canApprove = canUserApproveTask(currentUser);

  const startEditNextStep = (task: TaskItem) => {
    setEditingNextStepId(task.id);
    setNextStepDraft(task.nextStep ?? '');
  };

  const commitNextStep = (task: TaskItem) => {
    const trimmed = nextStepDraft.trim();
    if (trimmed !== (task.nextStep ?? '').trim()) {
      onQuickUpdate(
        task.id,
        { nextStep: trimmed || null },
        task.version
      );
    }
    setEditingNextStepId(null);
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
                : 'Chỉ đọc'}
              {canApprove ? ' (Có quyền duyệt)' : ''}
            </span>
          </p>
        </div>

        <label className="inline-flex items-center gap-2 text-xs sm:text-sm text-slate-700 cursor-pointer select-none min-h-[40px]">
          <input
            type="checkbox"
            checked={includeGroupTasks}
            onChange={(e) => setIncludeGroupTasks(e.target.checked)}
            className="w-4 h-4 rounded border-slate-300 text-[#13294B] focus:ring-[#13294B]"
          />
          <span>Hiển thị thêm việc gắn nhãn &ldquo;Nhóm&rdquo;</span>
        </label>
      </div>

      {currentUser.role === 'viewer' && (
        <div className="bg-slate-100 border border-slate-200 rounded-xl px-4 py-3 text-xs sm:text-sm text-slate-700 flex items-center gap-2.5">
          <Info className="w-4 h-4 text-slate-500 shrink-0" />
          <span>
            Vai trò <strong>Viewer (Chỉ đọc)</strong> chỉ được xem tiến độ và mở chi tiết, không chỉnh sửa dữ liệu.
          </span>
        </div>
      )}

      {myTasks.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl px-4 py-10 text-center">
          <p className="text-sm text-slate-600">
            Hiện không có công việc nào được phân công theo UID cho {currentUser.displayName}.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {myTasks.map((task) => {
            const canEdit = canUserEditTask(currentUser, task);
            const effCat = getEffectiveCategory(task, activeTasks, categories);
            const overdue = isTaskOverdue(task);
            const validDriveLinks = task.resultLinks
              .concat(task.referenceLinks)
              .filter((l) => Boolean(l.url));

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
                    <div className="flex items-baseline gap-2">
                      <span className="font-mono-tabular text-xs font-bold text-[#13294B] shrink-0">
                        {task.displayCode}
                      </span>
                      <span className="text-sm sm:text-base font-semibold text-slate-900 group-hover:text-[#13294B] group-hover:underline break-words">
                        {task.title}
                      </span>
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

                  <div className="flex items-center gap-2 shrink-0">
                    {canEdit ? (
                      <select
                        aria-label={`Cập nhật trạng thái cho ${task.title}`}
                        value={task.status ?? ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          onQuickUpdate(
                            task.id,
                            { status: val ? (val as TaskStatus) : null },
                            task.version
                          );
                        }}
                        className="w-full sm:w-auto px-3 py-2 text-xs font-medium bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#13294B] min-h-[40px]"
                      >
                        {task.status === null && (
                          <option value="">Cần rà soát (chưa có trạng thái)</option>
                        )}
                        {ALL_STATUSES.map((st) => {
                          const disabled = st === 'Hoàn thành' && !canApprove;
                          return (
                            <option key={st} value={st} disabled={disabled}>
                              {st}
                              {disabled ? ' (cần quyền duyệt)' : ''}
                            </option>
                          );
                        })}
                      </select>
                    ) : (
                      <StatusBadge status={task.status} />
                    )}
                  </div>
                </div>

                {/* Quick Next Step Editor */}
                <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  {editingNextStepId === task.id && canEdit ? (
                    <div className="flex-1 flex items-center gap-2">
                      <input
                        type="text"
                        value={nextStepDraft}
                        onChange={(e) => setNextStepDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitNextStep(task);
                          if (e.key === 'Escape') setEditingNextStepId(null);
                        }}
                        placeholder="Nhập bước tiếp theo..."
                        autoFocus
                        className="flex-1 min-w-0 px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#13294B] min-h-[38px]"
                      />
                      <button
                        type="button"
                        onClick={() => commitNextStep(task)}
                        className="px-3 py-2 text-xs font-medium bg-[#13294B] text-white rounded-lg inline-flex items-center gap-1 min-h-[38px] shrink-0"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Lưu</span>
                      </button>
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
                          className="text-[#13294B] hover:text-[#B8860B] font-medium whitespace-nowrap shrink-0 py-1 px-2"
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
                      className="inline-flex items-center gap-1 text-xs font-medium text-[#13294B] hover:underline shrink-0"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Mở tài liệu</span>
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
