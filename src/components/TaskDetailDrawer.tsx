import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  ExternalLink,
  History,
  Info,
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
  formatShortDate,
  getEffectiveCategory,
  isB1TestTask,
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
  onAddComment: (
    taskId: string,
    content: string
  ) => Promise<{ ok: boolean; error?: string }>;
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
  const [postingComment, setPostingComment] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [loadedVersion, setLoadedVersion] = useState(1);
  const [conflictError, setConflictError] = useState<string | null>(null);
  const [saveFeedback, setSaveFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
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
    setNewUrlLabel('');
    setNewUrlValue('');
    setNewUrlType('result');
    setCommentText('');
    setConflictError(null);
    setSaveFeedback(null);
    setCommentError(null);
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
  const statusLockedByCompletion = task.status === 'Hoàn thành' && !canApprove;
  const canCreateSubHere = canUserCreateSubtaskInParent(currentUser, task);
  const isAdmin = currentUser.role === 'admin' && currentUser.isActive;
  const parentTask = task.parentId
    ? allTasks.find((t) => t.id === task.parentId) ?? null
    : null;
  const childTasks = allTasks.filter(
    (t) => t.parentId === task.id && !t.archivedAt && !isB1TestTask(t)
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
    setSaveFeedback(null);
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

      const pendingTrimmedUrl = newUrlValue.trim();
      let nextReferenceLinks = referenceLinks;
      let nextResultLinks = resultLinks;
      if (pendingTrimmedUrl) {
        const pendingItem: DocumentLink = {
          id: `lnk_${Date.now()}`,
          label: newUrlLabel.trim() || 'Mở tài liệu',
          url: pendingTrimmedUrl,
          type: newUrlType === 'result' ? 'google_drive_link' : 'reference',
          needsUrlExtraction: false,
        };
        if (newUrlType === 'reference') {
          nextReferenceLinks = [...referenceLinks, pendingItem];
        } else {
          nextResultLinks = [...resultLinks, pendingItem];
        }
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
            status: statusLockedByCompletion ? task.status : nextStatus,
            nextStep: nextStep.trim() || null,
            dueDate: dueDate || null,
            notes: notes.trim() || null,
            referenceLinks: nextReferenceLinks,
            resultLinks: nextResultLinks,
            reviewFlags: updatedFlags,
          }
        : {
            status: statusLockedByCompletion ? task.status : nextStatus,
            nextStep: nextStep.trim() || null,
            notes: notes.trim() || null,
            referenceLinks: nextReferenceLinks,
            resultLinks: nextResultLinks,
          };

      const res = await onSaveTask(task.id, patch, loadedVersion);
      if (!res.ok) {
        const msg =
          res.error ||
          'Không thể lưu thay đổi lên Firestore. Vui lòng thử lại.';
        setConflictError(msg);
        setSaveFeedback({ type: 'error', text: msg });
      } else {
        if (pendingTrimmedUrl) {
          setReferenceLinks(nextReferenceLinks);
          setResultLinks(nextResultLinks);
          setNewUrlLabel('');
          setNewUrlValue('');
        }
        const nextVer = loadedVersion + 1;
        setLoadedVersion(nextVer);
        setSaveFeedback({
          type: 'success',
          text: `Đã lưu lên Firestore (v${nextVer})`,
        });
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
    setSaveFeedback(null);
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
    if (!commentText.trim() || currentUser.role === 'viewer' || postingComment) {
      return;
    }
    const content = commentText.trim();
    setPostingComment(true);
    setCommentError(null);
    try {
      const res = await onAddComment(task.id, content);
      if (res.ok) {
        setCommentText('');
      } else {
        setCommentError(
          res.error || 'Không thể gửi góp ý. Nội dung của bạn vẫn được giữ lại.'
        );
      }
    } finally {
      setPostingComment(false);
    }
  };

  const renderLinksSection = (editable: boolean) => (
    <div className="pt-3 border-t border-slate-200 space-y-3">
      <div className="text-xs font-semibold text-[#13294B]">
        Kết quả nghiên cứu hiện tại (Google Drive)
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
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[#13294B] hover:underline shrink-0 py-0.5"
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
            {editable && (
              <input
                type="url"
                value={lnk.url ?? ''}
                onChange={(e) =>
                  handleUpdateLinkUrl(lnk.id, e.target.value, 'result')
                }
                placeholder="https://drive.google.com/..."
                className="w-full px-2.5 py-2 text-xs bg-white border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-[#13294B] min-h-[38px]"
              />
            )}
          </div>
        ))
      )}

      <div className="pt-1">
        <div className="text-xs font-semibold text-slate-700 mb-1.5">
          Tài liệu phục vụ nghiên cứu
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
                      className="inline-flex items-center gap-1 text-xs font-semibold text-[#13294B] hover:underline shrink-0 py-0.5"
                    >
                      <span>Mở tài liệu</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
                {lnk.url && (
                  <div className="text-[11px] font-mono-tabular text-slate-500 break-all">
                    {lnk.url}
                  </div>
                )}
                {editable && (
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
                    className="w-full px-2.5 py-2 text-xs bg-white border border-slate-200 rounded min-h-[38px]"
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {editable && (
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 pt-1">
          <select
            aria-label="Loại liên kết"
            value={newUrlType}
            onChange={(e) =>
              setNewUrlType(e.target.value as 'result' | 'reference')
            }
            className="sm:col-span-3 px-2.5 py-2 text-xs bg-white border border-slate-200 rounded-lg min-h-[40px]"
          >
            <option value="result">Kết quả</option>
            <option value="reference">Tham khảo</option>
          </select>
          <input
            type="text"
            value={newUrlLabel}
            onChange={(e) => setNewUrlLabel(e.target.value)}
            placeholder="Nhãn liên kết"
            className="sm:col-span-3 px-2.5 py-2 text-xs bg-white border border-slate-200 rounded-lg min-h-[40px]"
          />
          <input
            type="url"
            value={newUrlValue}
            onChange={(e) => setNewUrlValue(e.target.value)}
            placeholder="https://drive.google.com/..."
            className="sm:col-span-4 px-2.5 py-2 text-xs bg-white border border-slate-200 rounded-lg min-h-[40px]"
          />
          <button
            type="button"
            onClick={handleAddLink}
            className="sm:col-span-2 px-3 py-2 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg min-h-[40px]"
          >
            Thêm link
          </button>
        </div>
      )}
    </div>
  );

  const renderSubtasksSection = () =>
    task.parentId === null ? (
      <div className="pt-2 border-t border-slate-200 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-[#13294B]">
            Việc con trực thuộc ({childTasks.length})
          </span>
          {canCreateSubHere && (
            <button
              type="button"
              onClick={() => onOpenAddSubtask(task.id)}
              className="inline-flex items-center gap-1 text-xs font-medium text-[#13294B] hover:text-[#B8860B] py-1 px-2 rounded-lg hover:bg-slate-100 min-h-[36px]"
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
                className="w-full text-left px-3 py-2.5 hover:bg-slate-50 flex items-center justify-between gap-2 text-xs min-h-[44px]"
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
    ) : null;

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
            className={`py-2.5 min-h-[44px] border-b-2 font-medium transition-colors whitespace-nowrap ${
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
            className={`py-2.5 min-h-[44px] border-b-2 font-medium transition-colors whitespace-nowrap inline-flex items-center gap-1.5 ${
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
            className={`py-2.5 min-h-[44px] border-b-2 font-medium transition-colors whitespace-nowrap inline-flex items-center gap-1.5 ${
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
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
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
                    {loadedVersion !== task.version
                      ? `Phát hiện dữ liệu mới hơn trên Firestore (v${task.version} so với bản bạn mở v${loadedVersion})`
                      : 'Không thể lưu thay đổi'}
                  </div>
                  <p className="mt-0.5 text-red-700">
                    {conflictError ||
                      `Cập nhật gần nhất bởi ${task.updatedBy ?? 'thành viên khác'}. Hệ thống chặn ghi đè âm thầm.`}
                  </p>
                </div>
              </div>
              {loadedVersion !== task.version && (
                <button
                  type="button"
                  onClick={handleReloadLatest}
                  className="px-3 py-1.5 text-xs font-medium bg-white border border-red-300 text-red-800 rounded-md hover:bg-red-100 min-h-[36px]"
                >
                  Tải bản mới nhất (v{task.version})
                </button>
              )}
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

          {activeTab === 'info' && !canEdit && (
            <div className="space-y-4">
              {/* Clear Read-Only View for Viewer or Unassigned Member (no disabled form boxes) */}
              <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-xs text-slate-600 flex items-start gap-2">
                <Info className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                <span>
                  {currentUser.role === 'viewer'
                    ? 'Bạn đang xem ở chế độ Chỉ đọc (Viewer).'
                    : 'Đầu việc này chưa được giao cho tài khoản của bạn nên bạn chỉ xem được thông tin.'}
                </span>
              </div>

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

              <div className="space-y-1">
                <div className="text-xs font-semibold text-slate-500">
                  Đầu việc
                </div>
                <h2 className="text-base sm:text-lg font-bold text-[#13294B] break-words">
                  {task.displayCode}. {task.title}
                </h2>
              </div>

              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs">
                <div>
                  <dt className="text-slate-500">Hạng mục</dt>
                  <dd className="font-medium text-slate-900 mt-0.5">
                    {effCategory.category || 'Chưa phân hạng mục'}
                    {effCategory.inherited ? ' (theo nhóm cha)' : ''}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Trạng thái hiện tại</dt>
                  <dd className="mt-1">
                    <StatusBadge status={task.status} compact />
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Người phụ trách</dt>
                  <dd className="font-medium text-slate-900 mt-0.5">
                    {task.assignees.length > 0
                      ? task.assignees.join(', ')
                      : 'Chưa phân công'}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Hạn xử lý</dt>
                  <dd className="font-mono-tabular font-medium text-slate-900 mt-0.5">
                    {formatShortDate(task.dueDate)}
                  </dd>
                </div>
              </dl>

              <div className="space-y-3 text-xs sm:text-sm">
                <div className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-1">
                  <div className="text-xs font-semibold text-slate-500">
                    Bước tiếp theo
                  </div>
                  <p className="text-slate-800 break-words">
                    {task.nextStep || 'Chưa ghi nhận bước tiếp theo.'}
                  </p>
                </div>

                {task.notes && (
                  <div className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-1">
                    <div className="text-xs font-semibold text-slate-500">
                      Ghi chú
                    </div>
                    <p className="text-slate-800 whitespace-pre-wrap break-words">
                      {task.notes}
                    </p>
                  </div>
                )}
              </div>

              {renderLinksSection(false)}
              {renderSubtasksSection()}

              <div className="pt-2 border-t border-slate-100 text-[11px] text-slate-500">
                Cập nhật gần nhất: {formatDateTime(task.updatedAt)}
                {task.updatedBy ? ` (${task.updatedBy})` : ''}
              </div>
            </div>
          )}

          {activeTab === 'info' && canEdit && (
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

              {isAdmin ? (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Mã hiển thị
                      </label>
                      <input
                        type="text"
                        maxLength={24}
                        value={displayCode}
                        onChange={(e) => setDisplayCode(e.target.value)}
                        className="w-full px-3 py-2 text-sm font-mono-tabular bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#13294B] min-h-[42px]"
                      />
                    </div>
                    <div className="sm:col-span-3">
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Tên đầu việc
                      </label>
                      <input
                        type="text"
                        maxLength={300}
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#13294B] min-h-[42px]"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Hạng mục (từ Firestore)
                      </label>
                      <select
                        value={categoryId}
                        onChange={(e) => setCategoryId(e.target.value)}
                        className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#13294B] min-h-[42px]"
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

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Hạn xử lý (Admin)
                      </label>
                      <input
                        type="date"
                        value={dueDate}
                        onChange={(e) => setDueDate(e.target.value)}
                        className="w-full px-3 py-2 text-sm font-mono-tabular bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#13294B] min-h-[42px]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Tên hiển thị người phụ trách (giữ tên gốc bảng tính)
                    </label>
                    <input
                      type="text"
                      value={assigneesText}
                      onChange={(e) => setAssigneesText(e.target.value)}
                      placeholder="VD: Quốc, Khả Tuệ"
                      className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#13294B] min-h-[42px]"
                    />
                  </div>
                </>
              ) : (
                /* Assigned Member sees ONLY clean read-only metadata for Admin-locked fields */
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2">
                  <div className="text-sm sm:text-base font-bold text-[#13294B] break-words">
                    {task.displayCode}. {task.title}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
                    <span>
                      Hạng mục:{' '}
                      <strong className="font-medium text-slate-800">
                        {effCategory.category || 'Chưa phân hạng mục'}
                        {effCategory.inherited ? ' (theo nhóm cha)' : ''}
                      </strong>
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>
                      Phụ trách:{' '}
                      <strong className="font-medium text-slate-800">
                        {task.assignees.length > 0
                          ? task.assignees.join(', ')
                          : 'Chưa phân công'}
                      </strong>
                    </span>
                    {task.dueDate && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono-tabular">
                          Hạn: {formatShortDate(task.dueDate)}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Workflow Status & Review/Approval Actions (editable by assigned Member & Admin) */}
              <div className="p-3.5 bg-slate-50/70 border border-slate-200 rounded-xl space-y-2.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <label
                    htmlFor="task-status-select"
                    className="text-xs font-semibold text-[#13294B]"
                  >
                    Trạng thái &amp; quy trình duyệt
                  </label>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {statusValue !== 'Chờ duyệt' && statusValue !== 'Hoàn thành' && (
                      <button
                        type="button"
                        onClick={() => setStatusValue('Chờ duyệt')}
                        className="px-2.5 py-1.5 text-xs font-medium rounded-lg bg-[#FFE699] border border-[#E8C868] text-[#5C4300] hover:brightness-95 min-h-[34px]"
                      >
                        Gửi chờ duyệt
                      </button>
                    )}
                    {canApprove && statusValue !== 'Hoàn thành' && (
                      <button
                        type="button"
                        onClick={() => setStatusValue('Hoàn thành')}
                        className="px-2.5 py-1.5 text-xs font-medium rounded-lg bg-[#A9D08E] border border-[#8BBC6B] text-[#1E4612] hover:brightness-95 min-h-[34px]"
                      >
                        Phê duyệt Hoàn thành
                      </button>
                    )}
                  </div>
                </div>

                <select
                  id="task-status-select"
                  value={statusValue}
                  disabled={statusLockedByCompletion}
                  onChange={(e) => setStatusValue(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#13294B] disabled:bg-slate-100 disabled:text-slate-600 min-h-[42px]"
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

                <p className="text-[11px] text-slate-500 leading-relaxed">
                  {statusLockedByCompletion ? (
                    <>
                      Đầu việc này đã được duyệt <strong>Hoàn thành</strong>. Chỉ Quản trị viên hoặc người có quyền phê duyệt mới thay đổi lại trạng thái (bạn vẫn có thể bổ sung ghi chú hoặc liên kết bên dưới).
                    </>
                  ) : (
                    <>
                      Luồng gợi ý: Cập nhật tiến độ (<strong>Đang làm</strong> / <strong>Tạm dừng</strong>) → bấm <strong>Gửi chờ duyệt</strong> (<strong>Chờ duyệt</strong>) →{' '}
                      {canApprove
                        ? 'bạn có quyền chọn Hoàn thành để nghiệm thu, rồi bấm Lưu thay đổi.'
                        : 'chờ Admin hoặc người có quyền duyệt xác nhận Hoàn thành. Nhớ bấm Lưu thay đổi bên dưới.'}
                    </>
                  )}
                </p>
              </div>

              {/* Admin-only explicit UID assignment & approval scope */}
              {isAdmin && members.length > 0 && (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2.5 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-[#13294B]">
                      Phân công tài khoản phụ trách (Admin)
                    </span>
                    {assigneeUids.length === 0 && (
                      <span className="text-[11px] font-medium text-[#7C4D00]">
                        Chưa liên kết tài khoản
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Quyền sửa và tạo việc con dựa vào tài khoản được tích bên dưới. Khi chuyển sang tài khoản chính thức sau này, Admin chỉ cần tích tài khoản mới và bỏ tích tài khoản cũ để thu hồi quyền mà vẫn giữ nguyên công việc và lịch sử.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {members
                      .filter((m) => m.isActive || assigneeUids.includes(m.uid))
                      .map((m) => (
                        <label
                          key={`assign_${m.uid}`}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 border rounded-lg cursor-pointer min-h-[38px] ${
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
                            {m.sheetAlias && m.sheetAlias !== m.displayName
                              ? ` (${m.sheetAlias})`
                              : ''}
                            {!m.isActive ? ' (Đã khóa)' : ''}
                          </span>
                        </label>
                      ))}
                  </div>
                  {members.some((m) => m.canApprove && m.role !== 'admin') && (
                    <div className="pt-1 border-t border-slate-200">
                      <div className="text-[11px] text-slate-600 mb-1">
                        Phạm vi người có quyền duyệt công việc:
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {members
                          .filter((m) => m.canApprove && m.role !== 'admin')
                          .map((m) => (
                            <label
                              key={`appr_${m.uid}`}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-[#FFF8E7] border border-[#D9A84E] rounded-lg cursor-pointer min-h-[38px]"
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
                              <span>
                                {m.displayName}
                                {m.sheetAlias && m.sheetAlias !== m.displayName
                                  ? ` (${m.sheetAlias})`
                                  : ''}{' '}
                                (Duyệt)
                              </span>
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
                  maxLength={500}
                  value={nextStep}
                  onChange={(e) => setNextStep(e.target.value)}
                  placeholder="VD: Chờ Sư phụ duyệt bản nháp"
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#13294B] min-h-[42px]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Ghi chú
                </label>
                <textarea
                  rows={3}
                  maxLength={2000}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ghi chú nội dung hoặc trao đổi thêm..."
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#13294B]"
                />
              </div>

              {renderLinksSection(true)}
              {renderSubtasksSection()}

              <div className="pt-2 border-t border-slate-100 text-[11px] text-slate-500">
                Cập nhật gần nhất: {formatDateTime(task.updatedAt)}
                {task.updatedBy ? ` (${task.updatedBy})` : ''}
              </div>
            </form>
          )}

          {activeTab === 'comments' && (
            <div className="space-y-4">
              {currentUser.role !== 'viewer' ? (
                <form onSubmit={handlePostComment} className="space-y-2">
                  <textarea
                    rows={3}
                    maxLength={2000}
                    value={commentText}
                    disabled={postingComment}
                    onChange={(e) => setCommentText(e.target.value)}
                    placeholder={`Viết góp ý dưới tên ${currentUser.displayName}...`}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#13294B] disabled:bg-slate-50"
                  />
                  {commentError && (
                    <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">
                      {commentError}
                    </div>
                  )}
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={!commentText.trim() || postingComment}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-[#13294B] text-white rounded-lg disabled:opacity-40 hover:bg-[#1E3A66] min-h-[42px]"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>{postingComment ? 'Đang gửi...' : 'Gửi góp ý'}</span>
                    </button>
                  </div>
                </form>
              ) : (
                <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-600">
                  Vai trò Viewer chỉ xem được các góp ý hiện có.
                </div>
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
                      <p className="text-sm text-slate-800 mt-1.5 whitespace-pre-wrap break-words">
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
                    <p className="text-slate-600 break-words">{log.summary}</p>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Bottom Sticky Action Footer */}
        {activeTab === 'info' && (
          <div className="px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t border-slate-200 bg-slate-50 space-y-2 shrink-0">
            {saveFeedback && (
              <div
                className={`text-xs flex items-center gap-1.5 ${
                  saveFeedback.type === 'success'
                    ? 'text-emerald-800 font-medium'
                    : 'text-red-700 font-medium'
                }`}
              >
                {saveFeedback.type === 'success' ? (
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                ) : (
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                )}
                <span className="truncate">{saveFeedback.text}</span>
              </div>
            )}
            <div className="flex items-center justify-between gap-3">
              {isAdmin && !task.archivedAt ? (
                <button
                  type="button"
                  onClick={() => onArchiveTask(task.id)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 hover:text-red-700 hover:bg-red-50 rounded-lg min-h-[42px] shrink-0"
                >
                  <Archive className="w-4 h-4" />
                  <span>Lưu trữ</span>
                </button>
              ) : (
                <span className="text-xs text-slate-500">
                  {canEdit
                    ? 'Chỉ bạn & Admin có thể cập nhật'
                    : 'Chế độ chỉ đọc'}
                </span>
              )}

              {canEdit && (
                <button
                  type="submit"
                  form="task-detail-form"
                  disabled={saving}
                  className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-5 py-2.5 text-sm font-medium bg-[#13294B] text-white rounded-lg hover:bg-[#1E3A66] disabled:opacity-50 min-h-[44px]"
                >
                  <Save className="w-4 h-4" />
                  <span>{saving ? 'Đang lưu...' : 'Lưu thay đổi'}</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
