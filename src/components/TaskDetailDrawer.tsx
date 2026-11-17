import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  ExternalLink,
  History,
  Link2Off,
  MessageSquare,
  Plus,
  RotateCcw,
  Save,
  Send,
  ShieldAlert,
  X,
} from 'lucide-react';
import {
  ActivityLog,
  CategoryItem,
  DocumentLink,
  ProjectMember,
  TaskComment,
  TaskItem,
  TaskStatus,
} from '../types/project';
import {
  subscribeTaskComments,
  subscribeTaskLogs,
} from '../services/firestoreService';
import {
  ALL_STATUSES,
  canUserApproveTask,
  canUserCreateSubtaskInParent,
  canUserEditTask,
  formatDateTime,
  getEffectiveCategory,
  REVIEW_FLAG_LABELS,
} from '../utils/taskHelpers';
import { computeUpdatedAssigneeNamesOnUidToggle } from '../utils/memberMapping';
import { StatusBadge } from './StatusBadge';

interface TaskDetailDrawerProps {
  task: TaskItem | null;
  allTasks: TaskItem[];
  categories: CategoryItem[];
  currentUser: ProjectMember;
  members: ProjectMember[];
  onClose: () => void;
  onSelectTask: (taskId: string) => void;
  onSaveTask: (
    taskId: string,
    patch: Partial<TaskItem>,
    expectedVersion: number
  ) => Promise<{ ok: boolean; error?: string }>;
  onAddComment: (taskId: string, content: string) => Promise<void>;
  onOpenAddSubtask: (parentId: string) => void;
  onArchiveTask: (taskId: string) => Promise<void>;
  onRestoreTask: (taskId: string) => Promise<void>;
}

export const TaskDetailDrawer: React.FC<TaskDetailDrawerProps> = ({
  task,
  allTasks,
  categories,
  currentUser,
  members,
  onClose,
  onSelectTask,
  onSaveTask,
  onAddComment,
  onOpenAddSubtask,
  onArchiveTask,
  onRestoreTask,
}) => {
  const [displayCode, setDisplayCode] = useState('');
  const [title, setTitle] = useState('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [assigneesText, setAssigneesText] = useState('');
  const [assigneeUids, setAssigneeUids] = useState<string[]>([]);
  const [approverUids, setApproverUids] = useState<string[]>([]);
  const [statusValue, setStatusValue] = useState<string>('');
  const [nextStep, setNextStep] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [referenceLinks, setReferenceLinks] = useState<DocumentLink[]>([]);
  const [resultLinks, setResultLinks] = useState<DocumentLink[]>([]);
  const [newUrlLabel, setNewUrlLabel] = useState('');
  const [newUrlValue, setNewUrlValue] = useState('');
  const [newUrlType, setNewUrlType] = useState<'result' | 'reference'>('result');
  const [commentText, setCommentText] = useState('');
  const [loadedVersion, setLoadedVersion] = useState(1);
  const [conflictError, setConflictError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'info' | 'comments' | 'history'>('info');
  const [taskComments, setTaskComments] = useState<TaskComment[]>([]);
  const [taskLogs, setTaskLogs] = useState<ActivityLog[]>([]);

  useEffect(() => {
    if (!task) return;
    setDisplayCode(task.displayCode);
    setTitle(task.title);
    setCategoryId(task.categoryId ?? '');
    setAssigneesText(task.assignees.join(', '));
    setAssigneeUids(task.assigneeUids ?? []);
    setApproverUids(task.approverUids ?? []);
    setStatusValue(task.status ?? '');
    setNextStep(task.nextStep ?? '');
    setDueDate(task.dueDate ?? '');
    setNotes(task.notes ?? '');
    setReferenceLinks(task.referenceLinks);
    setResultLinks(task.resultLinks);
    setLoadedVersion(task.version);
    setConflictError(null);
  }, [task?.id]);

  useEffect(() => {
    if (!task) {
      setTaskComments([]);
      setTaskLogs([]);
      return;
    }
    const unsubComments = subscribeTaskComments(
      task.id,
      setTaskComments,
      (err) => console.error('Comments listener error:', err)
    );
    const unsubLogs = subscribeTaskLogs(
      task.id,
      setTaskLogs,
      (err) => console.error('Logs listener error:', err)
    );
    return () => {
      unsubComments();
      unsubLogs();
    };
  }, [task?.id]);

  if (!task) return null;

  const canEdit = canUserEditTask(currentUser, task);
  const canApprove = canUserApproveTask(currentUser, task);
  const canCreateSubHere = canUserCreateSubtaskInParent(currentUser, task);
  const isAdmin = currentUser.role === 'admin' && currentUser.isActive;
  const parentTask = task.parentId
    ? allTasks.find((t) => t.id === task.parentId) ?? null
    : null;
  const childTasks = allTasks.filter(
    (t) => t.parentId === task.id && !t.archivedAt
  );
  const effCategory = getEffectiveCategory(task, allTasks, categories);
  const sortedCategories = [...categories].sort(
    (a, b) => a.sortOrder - b.sortOrder
  );

  const toggleUid = (list: string[], uid: string): string[] =>
    list.includes(uid) ? list.filter((u) => u !== uid) : [...list, uid];

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit || saving) return;
    setConflictError(null);
    setSaving(true);

    try {
      const parsedAssignees = assigneesText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const nextStatus: TaskStatus | null = statusValue
        ? (statusValue as TaskStatus)
        : null;

      const updatedFlags = task.reviewFlags.filter((f) => {
        if (f === 'missing_assignee' && assigneeUids.length > 0) return false;
        if (f === 'missing_status' && nextStatus !== null) return false;
        return true;
      });
      if (
        assigneeUids.length === 0 &&
        parsedAssignees.length === 0 &&
        !updatedFlags.includes('missing_assignee')
      ) {
        updatedFlags.push('missing_assignee');
      }
      if (nextStatus === null && !updatedFlags.includes('missing_status')) {
        updatedFlags.push('missing_status');
      }

      const selectedCat = categories.find((c) => c.id === categoryId);

      const patch: Partial<TaskItem> = isAdmin
        ? {
            displayCode: displayCode.trim() || task.displayCode,
            title: title.trim() || task.title,
            categoryId: categoryId || null,
            category: selectedCat ? selectedCat.name : null,
            assignees: parsedAssignees,
            assigneeUids,
            approverUids,
            status: nextStatus,
            nextStep: nextStep.trim() || null,
            dueDate: dueDate || null,
            notes: notes.trim() || null,
            referenceLinks,
            resultLinks,
            reviewFlags: updatedFlags,
          }
        : {
            status: nextStatus,
            nextStep: nextStep.trim() || null,
            notes: notes.trim() || null,
            referenceLinks,
            resultLinks,
          };

      const res = await onSaveTask(task.id, patch, loadedVersion);
      if (!res.ok) {
        setConflictError(
          res.error ||
            'Phát hiện xung đột phiên bản: dữ liệu vừa được thành viên khác cập nhật.'
        );
      } else {
        setLoadedVersion((v) => v + 1);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleReloadLatest = () => {
    setDisplayCode(task.displayCode);
    setTitle(task.title);
    setCategoryId(task.categoryId ?? '');
    setAssigneesText(task.assignees.join(', '));
    setAssigneeUids(task.assigneeUids ?? []);
    setApproverUids(task.approverUids ?? []);
    setStatusValue(task.status ?? '');
    setNextStep(task.nextStep ?? '');
    setDueDate(task.dueDate ?? '');
    setNotes(task.notes ?? '');
    setReferenceLinks(task.referenceLinks);
    setResultLinks(task.resultLinks);
    setLoadedVersion(task.version);
    setConflictError(null);
  };

  const handleUpdateLinkUrl = (
    linkId: string,
    urlVal: string,
    group: 'reference' | 'result'
  ) => {
    const clean = urlVal.trim() || null;
    if (group === 'reference') {
      setReferenceLinks((prev) =>
        prev.map((l) =>
          l.id === linkId
            ? { ...l, url: clean, needsUrlExtraction: !clean }
            : l
        )
      );
    } else {
      setResultLinks((prev) =>
        prev.map((l) =>
          l.id === linkId
            ? { ...l, url: clean, needsUrlExtraction: !clean }
            : l
        )
      );
    }
  };

  const handleAddLink = () => {
    if (!newUrlValue.trim()) return;
    const item: DocumentLink = {
      id: `lnk_${Date.now()}`,
      label: newUrlLabel.trim() || 'Mở tài liệu',
      url: newUrlValue.trim(),
      type: newUrlType === 'result' ? 'google_drive_link' : 'reference',
      needsUrlExtraction: false,
    };
    if (newUrlType === 'reference') {
      setReferenceLinks((prev) => [...prev, item]);
    } else {
      setResultLinks((prev) => [...prev, item]);
    }
    setNewUrlLabel('');
    setNewUrlValue('');
  };

  const handlePostComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim() || currentUser.role === 'viewer') return;
    const content = commentText.trim();
    setCommentText('');
    await onAddComment(task.id, content);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-label={`Chi tiết công việc ${task.displayCode}`}
    >
      <div className="flex-1 hidden sm:block" onClick={onClose} />

      <div className="w-full sm:max-w-xl bg-white h-full flex flex-col border-l border-slate-200 shadow-2xl">
        {/* Top Drawer Bar */}
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-mono-tabular text-xs font-bold px-2 py-1 rounded bg-[#13294B] text-white shrink-0">
              {task.displayCode}
            </span>
            <StatusBadge status={task.status} compact />
            <span className="text-xs font-mono-tabular text-slate-400">
              v{task.version}
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng chi tiết"
            className="w-10 h-10 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Sub-navigation tabs */}
        <div className="px-4 border-b border-slate-200 flex items-center gap-5 text-xs sm:text-sm shrink-0 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('info')}
            className={`py-2.5 border-b-2 font-medium transition-colors whitespace-nowrap ${
              activeTab === 'info'
                ? 'border-[#13294B] text-[#13294B]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Thông tin &amp; Liên kết
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('comments')}
            className={`py-2.5 border-b-2 font-medium transition-colors whitespace-nowrap inline-flex items-center gap-1.5 ${
              activeTab === 'comments'
                ? 'border-[#13294B] text-[#13294B]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Góp ý ({taskComments.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`py-2.5 border-b-2 font-medium transition-colors whitespace-nowrap inline-flex items-center gap-1.5 ${
              activeTab === 'history'
                ? 'border-[#13294B] text-[#13294B]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Lịch sử ({taskLogs.length})</span>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {task.archivedAt && (
            <div className="bg-slate-100 border border-slate-300 rounded-lg p-3 flex items-center justify-between gap-2 text-xs text-slate-700">
              <span>
                Đầu việc này đã được lưu trữ lúc {formatDateTime(task.archivedAt)}.
              </span>
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => onRestoreTask(task.id)}
                  className="inline-flex items-center gap-1 font-semibold text-[#13294B] hover:underline shrink-0"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Khôi phục</span>
                </button>
              )}
            </div>
          )}

          {(conflictError || loadedVersion !== task.version) && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 space-y-2">
              <div className="flex items-start gap-2 text-xs text-red-800">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold">
                    Phát hiện dữ liệu mới hơn trên Firestore (v{task.version} so với bản bạn mở v{loadedVersion})
                  </div>
                  <p className="mt-0.5 text-red-700">
                    {conflictError ||
                      `Cập nhật gần nhất bởi ${task.updatedBy ?? 'thành viên khác'}. Hệ thống chặn ghi đè âm thầm.`}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleReloadLatest}
                className="px-3 py-1.5 text-xs font-medium bg-white border border-red-300 text-red-800 rounded-md hover:bg-red-100"
              >
                Tải bản mới nhất (v{task.version})
              </button>
            </div>
          )}

          {task.reviewFlags.length > 0 && (
            <div className="bg-[#FFF8E7] border border-[#D9A84E] rounded-lg p-3 text-xs text-[#7C4D00] space-y-1">
              <div className="font-semibold flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>Cờ rà soát dữ liệu</span>
              </div>
              <ul className="list-disc pl-5 space-y-0.5">
                {task.reviewFlags.map((flag) => (
                  <li key={flag}>{REVIEW_FLAG_LABELS[flag]}</li>
                ))}
              </ul>
            </div>
          )}

          {activeTab === 'info' && (
            <form id="task-detail-form" onSubmit={handleSave} className="space-y-4">
              {parentTask && (
                <div className="text-xs text-slate-500">
                  Thuộc đầu việc cha:{' '}
                  <button
                    type="button"
                    onClick={() => onSelectTask(parentTask.id)}
                    className="font-medium text-[#13294B] hover:underline"
                  >
                    {parentTask.displayCode}. {parentTask.title}
                  </button>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Mã hiển thị
                  </label>
                  <input
                    type="text"
                    value={displayCode}
                    disabled={!isAdmin}
                    onChange={(e) => setDisplayCode(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono-tabular bg-white border border-slate-200 rounded-lg disabled:bg-slate-50 disabled:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#13294B]"
                  />
                </div>
                <div className="sm:col-span-3">
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Tên đầu việc
                  </label>
                  <input
                    type="text"
                    value={title}
                    disabled={!isAdmin}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg disabled:bg-slate-50 disabled:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#13294B]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Trạng thái
                  </label>
                  <select
                    value={statusValue}
                    disabled={!canEdit}
                    onChange={(e) => setStatusValue(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg disabled:bg-slate-50 disabled:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#13294B]"
                  >
                    <option value="">-- Chưa có trạng thái (Cần rà soát) --</option>
                    {ALL_STATUSES.map((st) => {
                      const needApproval = st === 'Hoàn thành' && !canApprove;
                      return (
                        <option key={st} value={st} disabled={needApproval}>
                          {st}
                          {needApproval ? ' (cần quyền phê duyệt)' : ''}
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Hạng mục (từ Firestore)
                  </label>
                  <select
                    value={categoryId}
                    disabled={!isAdmin}
                    onChange={(e) => setCategoryId(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg disabled:bg-slate-50 disabled:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#13294B]"
                  >
                    <option value="">
                      {effCategory.inherited
                        ? `Kế thừa từ cha (${effCategory.category})`
                        : 'Chưa phân hạng mục'}
                    </option>
                    {sortedCategories
                      .filter((cat) => cat.isActive || cat.id === categoryId)
                      .map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name}
                          {!cat.isActive ? ' (Ngừng dùng)' : ''}
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Tên hiển thị người phụ trách (chỉ hiển thị)
                  </label>
                  <input
                    type="text"
                    value={assigneesText}
                    disabled={!isAdmin}
                    onChange={(e) => setAssigneesText(e.target.value)}
                    placeholder="VD: Quốc, Khả Tuệ"
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg disabled:bg-slate-50 disabled:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#13294B]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Hạn xử lý (chỉ Admin sửa)
                  </label>
                  <input
                    type="date"
                    value={dueDate}
                    disabled={!isAdmin}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono-tabular bg-white border border-slate-200 rounded-lg disabled:bg-slate-50 disabled:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#13294B]"
                  />
                </div>
              </div>

              {/* Admin-only explicit UID assignment & approval scope */}
              {isAdmin && members.length > 0 && (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2.5 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-[#13294B]">
                      Phân quyền theo Firebase UID (Admin)
                    </span>
                    {assigneeUids.length === 0 && (
                      <span className="text-[11px] font-medium text-[#7C4D00]">
                        Chưa liên kết tài khoản
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Quyền sửa &amp; tạo việc con chỉ dựa vào UID được tích bên dưới. Khi đổi sang tài khoản chính thức sau này, chỉ cần tích UID mới và bỏ tích UID cũ để thu hồi quyền mà vẫn giữ nguyên công việc và lịch sử.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {members
                      .filter((m) => m.isActive || assigneeUids.includes(m.uid))
                      .map((m) => (
                        <label
                          key={`assign_${m.uid}`}
                          className={`inline-flex items-center gap-1.5 px-2 py-1 border rounded cursor-pointer ${
                            !m.isActive
                              ? 'bg-red-50 border-red-200 text-red-800'
                              : 'bg-white border-slate-200'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={assigneeUids.includes(m.uid)}
                            onChange={() => {
                              const nextUids = toggleUid(assigneeUids, m.uid);
                              setAssigneeUids(nextUids);
                              setAssigneesText(
                                computeUpdatedAssigneeNamesOnUidToggle(
                                  assigneesText,
                                  m,
                                  nextUids,
                                  members
                                )
                              );
                            }}
                          />
                          <span>
                            {m.displayName}
                            {!m.isActive ? ' (Đã khóa)' : ''}
                          </span>
                        </label>
                      ))}
                  </div>
                  {members.some((m) => m.canApprove && m.role !== 'admin') && (
                    <div className="pt-1 border-t border-slate-200">
                      <div className="text-[11px] text-slate-600 mb-1">
                        Phạm vi người có quyền duyệt (canApprove):
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {members
                          .filter((m) => m.canApprove && m.role !== 'admin')
                          .map((m) => (
                            <label
                              key={`appr_${m.uid}`}
                              className="inline-flex items-center gap-1.5 px-2 py-1 bg-[#FFF8E7] border border-[#D9A84E] rounded cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={approverUids.includes(m.uid)}
                                onChange={() =>
                                  setApproverUids((prev) =>
                                    toggleUid(prev, m.uid)
                                  )
                                }
                              />
                              <span>{m.displayName} (Duyệt)</span>
                            </label>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Bước tiếp theo
                </label>
                <input
                  type="text"
                  value={nextStep}
                  disabled={!canEdit}
                  onChange={(e) => setNextStep(e.target.value)}
                  placeholder="VD: Chờ Sư phụ duyệt bản nháp"
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg disabled:bg-slate-50 disabled:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#13294B]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Ghi chú
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  disabled={!canEdit}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg disabled:bg-slate-50 disabled:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#13294B]"
                />
              </div>

              {/* Result Links & Reference Links */}
              <div className="pt-3 border-t border-slate-200 space-y-3">
                <div className="text-xs font-semibold text-[#13294B]">
                  Kết quả nghiên cứu hiện tại (cột K — Google Drive)
                </div>

                {resultLinks.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    Chưa có liên kết kết quả nghiên cứu.
                  </p>
                ) : (
                  resultLinks.map((lnk) => (
                    <div
                      key={lnk.id}
                      className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-slate-800 truncate">
                          {lnk.label}
                        </span>
                        {lnk.url ? (
                          <a
                            href={lnk.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-semibold text-[#13294B] hover:underline shrink-0"
                          >
                            <span>Mở Drive</span>
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] text-[#7C4D00] shrink-0">
                            <Link2Off className="w-3 h-3" />
                            <span>Chưa có URL</span>
                          </span>
                        )}
                      </div>
                      {lnk.url && (
                        <div className="text-[11px] font-mono-tabular text-slate-500 break-all">
                          {lnk.url}
                        </div>
                      )}
                      {canEdit && (
                        <input
                          type="url"
                          value={lnk.url ?? ''}
                          onChange={(e) =>
                            handleUpdateLinkUrl(lnk.id, e.target.value, 'result')
                          }
                          placeholder="https://drive.google.com/..."
                          className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-[#13294B]"
                        />
                      )}
                    </div>
                  ))
                )}

                <div className="pt-1">
                  <div className="text-xs font-semibold text-slate-700 mb-1.5">
                    Tài liệu phục vụ nghiên cứu (cột J)
                  </div>
                  {referenceLinks.length === 0 ? (
                    <p className="text-xs text-slate-500">
                      Chưa có liên kết tài liệu tham khảo.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {referenceLinks.map((lnk) => (
                        <div
                          key={lnk.id}
                          className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-medium text-slate-800 truncate">
                              {lnk.label}
                            </span>
                            {lnk.url && (
                              <a
                                href={lnk.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs font-semibold text-[#13294B] hover:underline shrink-0"
                              >
                                <span>Mở tài liệu</span>
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            )}
                          </div>
                          {canEdit && (
                            <input
                              type="url"
                              value={lnk.url ?? ''}
                              onChange={(e) =>
                                handleUpdateLinkUrl(
                                  lnk.id,
                                  e.target.value,
                                  'reference'
                                )
                              }
                              placeholder="https://drive.google.com/..."
                              className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded"
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {canEdit && (
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 pt-1">
                    <select
                      aria-label="Loại liên kết"
                      value={newUrlType}
                      onChange={(e) =>
                        setNewUrlType(e.target.value as 'result' | 'reference')
                      }
                      className="sm:col-span-3 px-2 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                    >
                      <option value="result">Kết quả (K)</option>
                      <option value="reference">Tham khảo (J)</option>
                    </select>
                    <input
                      type="text"
                      value={newUrlLabel}
                      onChange={(e) => setNewUrlLabel(e.target.value)}
                      placeholder="Nhãn liên kết"
                      className="sm:col-span-3 px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                    />
                    <input
                      type="url"
                      value={newUrlValue}
                      onChange={(e) => setNewUrlValue(e.target.value)}
                      placeholder="https://drive.google.com/..."
                      className="sm:col-span-4 px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                    />
                    <button
                      type="button"
                      onClick={handleAddLink}
                      className="sm:col-span-2 px-2.5 py-1.5 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg"
                    >
                      Thêm link
                    </button>
                  </div>
                )}
              </div>

              {/* Subtasks list if parent */}
              {task.parentId === null && (
                <div className="pt-2 border-t border-slate-200 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[#13294B]">
                      Việc con trực thuộc ({childTasks.length})
                    </span>
                    {canCreateSubHere && (
                      <button
                        type="button"
                        onClick={() => onOpenAddSubtask(task.id)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-[#13294B] hover:text-[#B8860B]"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Thêm việc con</span>
                      </button>
                    )}
                  </div>
                  {childTasks.length === 0 ? (
                    <p className="text-xs text-slate-500">
                      Nhóm này không có việc con.
                    </p>
                  ) : (
                    <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
                      {childTasks.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => onSelectTask(c.id)}
                          className="w-full text-left px-3 py-2.5 hover:bg-slate-50 flex items-center justify-between gap-2 text-xs"
                        >
                          <div className="min-w-0 truncate">
                            <span className="font-mono-tabular font-semibold text-[#13294B] mr-2">
                              {c.displayCode}
                            </span>
                            <span className="text-slate-800">{c.title}</span>
                          </div>
                          <StatusBadge status={c.status} compact />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="pt-2 border-t border-slate-100 text-[11px] text-slate-500">
                Cập nhật gần nhất: {formatDateTime(task.updatedAt)}
                {task.updatedBy ? ` (${task.updatedBy})` : ''}
              </div>
            </form>
          )}

          {activeTab === 'comments' && (
            <div className="space-y-4">
              {currentUser.role !== 'viewer' && (
                <form onSubmit={handlePostComment} className="space-y-2">
                  <textarea
                    rows={3}
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    placeholder={`Viết góp ý dưới tên ${currentUser.displayName}...`}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#13294B]"
                  />
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={!commentText.trim()}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-[#13294B] text-white rounded-lg disabled:opacity-40 hover:bg-[#1E3A66]"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Gửi góp ý</span>
                    </button>
                  </div>
                </form>
              )}

              <div className="space-y-2.5">
                {taskComments.length === 0 ? (
                  <p className="text-sm text-slate-500 py-6 text-center">
                    Chưa có góp ý nào cho đầu việc này.
                  </p>
                ) : (
                  taskComments.map((c) => (
                    <div
                      key={c.id}
                      className="p-3 bg-slate-50 border border-slate-200 rounded-lg"
                    >
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-semibold text-[#13294B]">
                          {c.authorName}
                        </span>
                        <span className="font-mono-tabular text-slate-400">
                          {formatDateTime(c.createdAt)}
                        </span>
                      </div>
                      <p className="text-sm text-slate-800 mt-1.5 whitespace-pre-wrap">
                        {c.content}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {activeTab === 'history' && (
            <div className="space-y-2.5">
              {taskLogs.length === 0 ? (
                <p className="text-sm text-slate-500 py-6 text-center">
                  Chưa có lịch sử cập nhật trên Firestore.
                </p>
              ) : (
                taskLogs.map((log) => (
                  <div
                    key={log.id}
                    className="p-3 bg-white border border-slate-200 rounded-lg text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-slate-800">
                        {log.actorName}
                      </span>
                      <span className="font-mono-tabular text-slate-400">
                        {formatDateTime(log.createdAt)}
                      </span>
                    </div>
                    <p className="text-slate-600">{log.summary}</p>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Bottom Sticky Action Footer */}
        {activeTab === 'info' && (
          <div className="px-4 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-3 shrink-0">
            {isAdmin && !task.archivedAt ? (
              <button
                type="button"
                onClick={() => onArchiveTask(task.id)}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 hover:text-red-700 hover:bg-red-50 rounded-lg min-h-[40px]"
              >
                <Archive className="w-4 h-4" />
                <span>Lưu trữ</span>
              </button>
            ) : (
              <span className="text-xs text-slate-500">
                {canEdit ? 'Có quyền chỉnh sửa' : 'Chế độ chỉ đọc'}
              </span>
            )}

            {canEdit && (
              <button
                type="submit"
                form="task-detail-form"
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-[#13294B] text-white rounded-lg hover:bg-[#1E3A66] disabled:opacity-50 min-h-[42px]"
              >
                <Save className="w-4 h-4" />
                <span>{saving ? 'Đang lưu...' : 'Lưu thay đổi'}</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
