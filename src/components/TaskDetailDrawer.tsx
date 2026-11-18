import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FileText,
  FolderOpen,
  History,
  Link2Off,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Send,
  ShieldAlert,
  Trash2,
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
  computeParentProgress,
  formatDateTime,
  formatShortDate,
  getEffectiveCategory,
  isB1TestTask,
  isTaskOverdue,
  REVIEW_FLAG_LABELS,
} from '../utils/taskHelpers';
import {
  computeUpdatedAssigneeNamesOnUidToggle,
  EXPECTED_TBHGN_ACCOUNTS,
  getExpectedAccountAliases,
  isReplacedTemporaryAccountEmail,
  normalizeTextKey,
} from '../utils/memberMapping';
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

type PendingNavigationAction =
  | { type: 'close' }
  | { type: 'cancel_edit' }
  | { type: 'tab'; tab: 'info' | 'comments' | 'history' }
  | { type: 'select_task'; taskId: string };

function getCompactMemberLabel(member: ProjectMember): string {
  const emailNorm = normalizeTextKey(member.email);
  const expected = EXPECTED_TBHGN_ACCOUNTS.find(
    (acc) => normalizeTextKey(acc.email) === emailNorm
  );
  if (expected) return expected.displayName;
  const dn = member.displayName?.trim();
  if (dn && dn.toLowerCase() !== 'admin') return dn;
  const sa = member.sheetAlias?.trim();
  if (sa) return sa;
  return member.email?.split('@')[0] || 'Thành viên';
}

function toCompactAliasDisplay(rawAlias: string): string {
  const norm = normalizeTextKey(rawAlias);
  if (!norm) return '';
  const matched = EXPECTED_TBHGN_ACCOUNTS.find((acc) =>
    getExpectedAccountAliases(acc).some(
      (candidate) => normalizeTextKey(candidate) === norm
    )
  );
  return matched ? matched.displayName : rawAlias.trim();
}

function getCompactTaskAssignees(
  task: TaskItem,
  members: ProjectMember[]
): string[] {
  const result: string[] = [];
  const seenNorm = new Set<string>();

  const pushLabel = (label: string) => {
    const clean = label.trim();
    if (!clean) return;
    const key = normalizeTextKey(clean);
    if (seenNorm.has(key)) return;
    seenNorm.add(key);
    result.push(clean);
  };

  for (const raw of task.assignees) {
    pushLabel(toCompactAliasDisplay(raw));
  }

  for (const uid of task.assigneeUids ?? []) {
    const member = members.find((m) => m.uid === uid);
    if (member) {
      pushLabel(getCompactMemberLabel(member));
    }
  }

  return result;
}

function getLinkHostLabel(url: string | null): string {
  if (!url) return 'Chưa có liên kết';
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    if (host.includes('drive.google.com')) return 'Google Drive';
    if (host.includes('docs.google.com')) return 'Google Docs';
    return host;
  } catch {
    return 'Liên kết ngoài';
  }
}

function normalizeLinksKey(links: DocumentLink[]): string {
  return links
    .map(
      (l) =>
        `${l.id}|${l.label.trim()}|${(l.url ?? '').trim()}|${l.type}`
    )
    .join(';;');
}

function sameStringSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const setB = new Set(b);
  return a.every((item) => setB.has(item));
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
  const [isEditing, setIsEditing] = useState(false);
  const [showManageSection, setShowManageSection] = useState(false);
  const [showAdminMenu, setShowAdminMenu] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [archiving, setArchiving] = useState(false);

  const [displayCode, setDisplayCode] = useState('');
  const [title, setTitle] = useState('');
  const [titleError, setTitleError] = useState<string | null>(null);
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
  const [activeTab, setActiveTab] = useState<'info' | 'comments' | 'history'>(
    'info'
  );
  const [taskComments, setTaskComments] = useState<TaskComment[]>([]);
  const [taskLogs, setTaskLogs] = useState<ActivityLog[]>([]);
  const [pendingAction, setPendingAction] =
    useState<PendingNavigationAction | null>(null);

  const adminMenuRef = useRef<HTMLDivElement | null>(null);

  const syncDraftFromTask = (source: TaskItem) => {
    setDisplayCode(source.displayCode);
    setTitle(source.title);
    setTitleError(null);
    setCategoryId(source.categoryId ?? '');
    setAssigneesText(source.assignees.join(', '));
    setAssigneeUids(source.assigneeUids ?? []);
    setApproverUids(source.approverUids ?? []);
    setStatusValue(source.status ?? '');
    setNextStep(source.nextStep ?? '');
    setDueDate(source.dueDate ?? '');
    setNotes(source.notes ?? '');
    setReferenceLinks(source.referenceLinks);
    setResultLinks(source.resultLinks);
    setLoadedVersion(source.version);
    setNewUrlLabel('');
    setNewUrlValue('');
    setNewUrlType('result');
  };

  // Reset full drawer state when opening a different task
  useEffect(() => {
    if (!task) return;
    setIsEditing(false);
    setShowManageSection(false);
    setShowAdminMenu(false);
    setConfirmArchive(false);
    setArchiving(false);
    setPendingAction(null);
    setActiveTab('info');
    syncDraftFromTask(task);
    setCommentText('');
    setConflictError(null);
    setSaveFeedback(null);
    setCommentError(null);
  }, [task?.id]);

  // Keep View-mode draft synced with real-time Firestore snapshots when not actively editing
  useEffect(() => {
    if (!task || isEditing || saving) return;
    syncDraftFromTask(task);
    setConflictError(null);
  }, [task, isEditing, saving]);

  // Lock background page scroll while drawer is open
  useEffect(() => {
    if (!task) return;
    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevBodyOverflow;
      document.documentElement.style.overflow = prevHtmlOverflow;
    };
  }, [Boolean(task)]);

  // Subscribe to comments and activity logs for the open task
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

  // Close Admin secondary menu on outside click
  useEffect(() => {
    if (!showAdminMenu) return;
    const handlePointerDown = (e: PointerEvent) => {
      if (
        adminMenuRef.current &&
        !adminMenuRef.current.contains(e.target as Node)
      ) {
        setShowAdminMenu(false);
        setConfirmArchive(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [showAdminMenu]);

  const isManager =
    (currentUser.role === 'admin' || currentUser.role === 'moderator') &&
    currentUser.isActive;

  const isDirty = useMemo(() => {
    if (!task || !isEditing) return false;
    if (statusValue !== (task.status ?? '')) return true;
    if (nextStep.trim() !== (task.nextStep ?? '').trim()) return true;
    if (notes.trim() !== (task.notes ?? '').trim()) return true;
    if (
      normalizeLinksKey(resultLinks) !== normalizeLinksKey(task.resultLinks)
    ) {
      return true;
    }
    if (
      normalizeLinksKey(referenceLinks) !==
      normalizeLinksKey(task.referenceLinks)
    ) {
      return true;
    }
    if (newUrlValue.trim() !== '') return true;

    if (isManager) {
      if (displayCode.trim() !== task.displayCode) return true;
      if (title.trim() !== task.title) return true;
      if (categoryId !== (task.categoryId ?? '')) return true;
      if (dueDate !== (task.dueDate ?? '')) return true;
      if (assigneesText.trim() !== task.assignees.join(', ').trim()) return true;
      if (!sameStringSet(assigneeUids, task.assigneeUids ?? [])) return true;
      if (!sameStringSet(approverUids, task.approverUids ?? [])) return true;
    }

    return false;
  }, [
    task,
    isEditing,
    isManager,
    statusValue,
    nextStep,
    notes,
    resultLinks,
    referenceLinks,
    newUrlValue,
    displayCode,
    title,
    categoryId,
    dueDate,
    assigneesText,
    assigneeUids,
    approverUids,
  ]);

  const assignableMembers = useMemo(() => {
    return members.filter(
      (m) =>
        (m.isActive &&
          m.role !== 'viewer' &&
          !isReplacedTemporaryAccountEmail(m.email)) ||
        assigneeUids.includes(m.uid)
    );
  }, [members, assigneeUids]);

  const duplicateMemberLabels = useMemo(() => {
    const counts = new Map<string, number>();
    assignableMembers.forEach((m) => {
      const label = getCompactMemberLabel(m).toLowerCase();
      counts.set(label, (counts.get(label) ?? 0) + 1);
    });
    const dups = new Set<string>();
    counts.forEach((cnt, key) => {
      if (cnt > 1) dups.add(key);
    });
    return dups;
  }, [assignableMembers]);

  const executePendingAction = (action: PendingNavigationAction) => {
    if (!task) return;
    syncDraftFromTask(task);
    setIsEditing(false);
    setShowManageSection(false);
    setPendingAction(null);
    setConflictError(null);

    if (action.type === 'close') {
      onClose();
    } else if (action.type === 'tab') {
      setActiveTab(action.tab);
    } else if (action.type === 'select_task') {
      onSelectTask(action.taskId);
    }
  };

  const handleIntent = (action: PendingNavigationAction) => {
    if (saving || archiving) return;
    if (isEditing && isDirty) {
      setPendingAction(action);
      return;
    }
    if (action.type === 'cancel_edit') {
      if (task) syncDraftFromTask(task);
      setIsEditing(false);
      setShowManageSection(false);
      setConflictError(null);
      return;
    }
    if (action.type === 'close') {
      onClose();
    } else if (action.type === 'tab') {
      setIsEditing(false);
      setActiveTab(action.tab);
    } else if (action.type === 'select_task') {
      setIsEditing(false);
      onSelectTask(action.taskId);
    }
  };

  // Clear pending discard confirmation if user resumes editing
  useEffect(() => {
    if (pendingAction) setPendingAction(null);
  }, [
    displayCode,
    title,
    categoryId,
    assigneesText,
    assigneeUids,
    approverUids,
    statusValue,
    nextStep,
    dueDate,
    notes,
    referenceLinks,
    resultLinks,
    newUrlValue,
  ]);

  // Escape key hierarchy: Admin menu -> Unsaved prompt -> Close / Guard
  useEffect(() => {
    if (!task) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (showAdminMenu) {
        e.stopPropagation();
        setShowAdminMenu(false);
        setConfirmArchive(false);
        return;
      }
      if (pendingAction) {
        e.stopPropagation();
        setPendingAction(null);
        return;
      }
      handleIntent({ type: 'close' });
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [task, showAdminMenu, pendingAction, isEditing, isDirty, saving, archiving]);

  if (!task) return null;

  const canEdit = canUserEditTask(currentUser, task);
  const canApprove = canUserApproveTask(currentUser, task);
  const statusLockedByCompletion = task.status === 'Hoàn thành' && !canApprove;
  const canCreateSubHere = canUserCreateSubtaskInParent(currentUser, task);
  const overdue = isTaskOverdue(task);

  const parentTask = task.parentId
    ? allTasks.find((t) => t.id === task.parentId) ?? null
    : null;
  const childTasks = allTasks.filter(
    (t) => t.parentId === task.id && !t.archivedAt && !isB1TestTask(t)
  );
  const childProgress =
    task.parentId === null
      ? computeParentProgress(task.id, allTasks)
      : null;

  const effCategory = getEffectiveCategory(task, allTasks, categories);
  const sortedCategories = [...categories].sort(
    (a, b) => a.sortOrder - b.sortOrder
  );

  const compactAssignees = getCompactTaskAssignees(task, members);
  const approverMembers = members.filter(
    (m) => m.canApprove && m.role !== 'admin' && m.role !== 'moderator'
  );

  const toggleUid = (list: string[], uid: string): string[] =>
    list.includes(uid) ? list.filter((u) => u !== uid) : [...list, uid];

  const startEditing = () => {
    if (!canEdit) return;
    syncDraftFromTask(task);
    setSaveFeedback(null);
    setConflictError(null);
    setPendingAction(null);
    setShowAdminMenu(false);
    setActiveTab('info');
    setIsEditing(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit || saving || !isDirty) return;

    if (isManager && !title.trim()) {
      setTitleError('Vui lòng nhập tên công việc.');
      setShowManageSection(true);
      return;
    }

    setTitleError(null);
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

      const patch: Partial<TaskItem> = isManager
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
          'Không thể lưu thay đổi lên hệ thống. Bản nháp của bạn vẫn được giữ nguyên.';
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
        setIsEditing(false);
        setShowManageSection(false);
        setPendingAction(null);
        setSaveFeedback({
          type: 'success',
          text: `Đã lưu thay đổi lên hệ thống (v${nextVer})`,
        });
      }
    } finally {
      setSaving(false);
    }
  };

  const handleReloadLatest = () => {
    syncDraftFromTask(task);
    setConflictError(null);
    setSaveFeedback(null);
  };

  const handleUpdateLink = (
    linkId: string,
    patch: { label?: string; url?: string },
    group: 'reference' | 'result'
  ) => {
    const updater = (prev: DocumentLink[]) =>
      prev.map((l) => {
        if (l.id !== linkId) return l;
        const nextUrl =
          patch.url !== undefined ? patch.url.trim() || null : l.url;
        const nextLabel =
          patch.label !== undefined ? patch.label : l.label;
        return {
          ...l,
          label: nextLabel,
          url: nextUrl,
          needsUrlExtraction: !nextUrl,
        };
      });
    if (group === 'reference') {
      setReferenceLinks(updater);
    } else {
      setResultLinks(updater);
    }
  };

  const handleRemoveLink = (
    linkId: string,
    group: 'reference' | 'result'
  ) => {
    if (group === 'reference') {
      setReferenceLinks((prev) => prev.filter((l) => l.id !== linkId));
    } else {
      setResultLinks((prev) => prev.filter((l) => l.id !== linkId));
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

  const handleArchiveConfirmed = async () => {
    if (!isManager || archiving) return;
    setArchiving(true);
    try {
      await onArchiveTask(task.id);
      setShowAdminMenu(false);
      setConfirmArchive(false);
    } finally {
      setArchiving(false);
    }
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
          res.error ||
            'Không thể gửi góp ý. Nội dung của bạn vẫn được giữ lại.'
        );
      }
    } finally {
      setPostingComment(false);
    }
  };

  const statusDraftChanged = isEditing && statusValue !== (task.status ?? '');

  const inputBaseClass =
    'w-full px-3 text-[13.5px] bg-white border border-[#DFD8CA] rounded-xl text-huyen-lam placeholder:text-[#969EAE] focus:outline-none focus:ring-2 focus:ring-lam-sang/25 focus:border-lam-sang transition-colors';

  const renderReadOnlyLinksList = (
    links: DocumentLink[],
    emptyLabel: string,
    accent: 'result' | 'reference'
  ) => {
    if (links.length === 0) {
      return <p className="text-xs text-[#8A94A3]">{emptyLabel}</p>;
    }

    return (
      <div className="space-y-1.5">
        {links.map((lnk) =>
          lnk.url ? (
            <a
              key={lnk.id}
              href={lnk.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl bg-white border border-[#E7E1D4] hover:border-lam-sang/55 hover:bg-[#FAF8F3] transition-colors min-h-[44px]"
            >
              <div className="min-w-0 flex items-center gap-2.5">
                <span
                  className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                    accent === 'result'
                      ? 'bg-minh-kim-soft text-minh-kim-ink'
                      : 'bg-lam-sang-soft text-lam-sang-ink'
                  }`}
                  aria-hidden="true"
                >
                  <FileText className="w-3.5 h-3.5" />
                </span>
                <div className="min-w-0">
                  <div className="text-[13px] font-medium text-huyen-lam group-hover:text-lam-tri-tue truncate">
                    {lnk.label}
                  </div>
                  <div className="text-[11px] text-[#7D8796] truncate">
                    {getLinkHostLabel(lnk.url)}
                  </div>
                </div>
              </div>
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-lam-tri-tue group-hover:text-huyen-lam shrink-0">
                <span>Mở</span>
                <ExternalLink className="w-3.5 h-3.5 shrink-0" />
              </span>
            </a>
          ) : (
            <div
              key={lnk.id}
              className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl bg-[#FAF8F3] border border-[#EBE5D9] min-h-[44px]"
            >
              <div className="min-w-0 flex items-center gap-2.5">
                <span
                  className="w-7 h-7 rounded-lg bg-[#EFEAE0] text-[#7D8796] flex items-center justify-center shrink-0"
                  aria-hidden="true"
                >
                  <Link2Off className="w-3.5 h-3.5" />
                </span>
                <div className="min-w-0">
                  <div className="text-[13px] font-medium text-huyen-lam truncate">
                    {lnk.label}
                  </div>
                  <div className="text-[11px] text-minh-kim-ink">
                    Chưa gắn đường dẫn
                  </div>
                </div>
              </div>
            </div>
          )
        )}
      </div>
    );
  };

  const renderEditableLinksGroup = (
    links: DocumentLink[],
    group: 'result' | 'reference',
    emptyLabel: string
  ) => {
    if (links.length === 0) {
      return <p className="text-xs text-[#8A94A3]">{emptyLabel}</p>;
    }

    return (
      <div className="space-y-2">
        {links.map((lnk) => (
          <div
            key={lnk.id}
            className="p-2.5 rounded-xl bg-[#FAF8F3] border border-[#E5DFD2] space-y-2"
          >
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={lnk.label}
                onChange={(e) =>
                  handleUpdateLink(lnk.id, { label: e.target.value }, group)
                }
                placeholder="Tên tài liệu"
                aria-label="Tên tài liệu"
                className="flex-1 min-w-0 h-[34px] px-2.5 text-xs font-medium bg-white border border-[#DFD8CA] rounded-lg text-huyen-lam focus:outline-none focus:ring-2 focus:ring-lam-sang/25 focus:border-lam-sang"
              />
              {lnk.url && (
                <a
                  href={lnk.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Mở liên kết trong tab mới"
                  aria-label={`Mở ${lnk.label}`}
                  className="w-[34px] h-[34px] flex items-center justify-center rounded-lg bg-white border border-[#DFD8CA] text-lam-tri-tue hover:bg-lam-sang-soft shrink-0"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
              <button
                type="button"
                onClick={() => handleRemoveLink(lnk.id, group)}
                title="Xóa liên kết này"
                aria-label={`Xóa ${lnk.label}`}
                className="w-[34px] h-[34px] flex items-center justify-center rounded-lg bg-white border border-[#DFD8CA] text-[#7D8796] hover:text-chu-sa hover:border-chu-sa-border hover:bg-chu-sa-soft shrink-0 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
            <input
              type="url"
              value={lnk.url ?? ''}
              onChange={(e) =>
                handleUpdateLink(lnk.id, { url: e.target.value }, group)
              }
              placeholder="https://drive.google.com/..."
              aria-label={`Đường dẫn ${lnk.label}`}
              className="w-full h-[34px] px-2.5 text-xs font-mono-tabular bg-white border border-[#DFD8CA] rounded-lg text-huyen-lam placeholder:text-[#969EAE] focus:outline-none focus:ring-2 focus:ring-lam-sang/25 focus:border-lam-sang"
            />
          </div>
        ))}
      </div>
    );
  };

  return (
    <div
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          handleIntent({ type: 'close' });
        }
      }}
      className="fixed inset-0 z-50 flex justify-end bg-huyen-lam/45 backdrop-blur-[1.5px] overscroll-contain"
      role="dialog"
      aria-modal="true"
      aria-label={`Chi tiết công việc ${task.displayCode}`}
    >
      <div
        className="flex-1 hidden sm:block"
        onClick={() => handleIntent({ type: 'close' })}
      />

      <div className="w-full sm:max-w-[560px] bg-trang-nga h-[100dvh] flex flex-col border-l border-[#E5DFD2] shadow-[0_24px_60px_-16px_rgba(20,36,63,0.3)] overflow-hidden">
        {/* Fixed Header */}
        <header className="shrink-0 px-4 sm:px-5 pt-3.5 pb-3 bg-[#FAF8F3] border-b border-[#EAE3D5]">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1 space-y-1.5">
              {parentTask && (
                <button
                  type="button"
                  onClick={() =>
                    handleIntent({ type: 'select_task', taskId: parentTask.id })
                  }
                  className="inline-flex items-center gap-1 text-[11.5px] font-medium text-[#667182] hover:text-lam-tri-tue max-w-full text-left transition-colors"
                >
                  <span className="font-mono-tabular font-semibold text-huyen-lam shrink-0">
                    {parentTask.displayCode}
                  </span>
                  <ChevronRight className="w-3 h-3 shrink-0 text-[#969EAE]" />
                  <span className="truncate">{parentTask.title}</span>
                </button>
              )}

              {/* 1. Prominent Task Title */}
              <h2 className="text-[17px] sm:text-[18px] font-bold text-huyen-lam leading-snug tracking-[-0.015em] break-words">
                {task.title}
              </h2>

              {/* 2. Code + Status */}
              <div className="flex flex-wrap items-center gap-2 pt-0.5">
                <span className="font-mono-tabular text-xs font-bold px-2 py-0.5 rounded-md bg-huyen-lam text-kim-quang shrink-0">
                  {task.displayCode}
                </span>
                <StatusBadge status={task.status} soft compact />
                {isEditing && (
                  <span className="text-[11px] font-medium text-minh-kim-ink">
                    · Đang chỉnh sửa
                  </span>
                )}
              </div>

              {/* 3. Unboxed Context Metadata: Assignee · Category · Due Date */}
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[#5E697A] pt-0.5">
                <span className="text-huyen-lam font-medium">
                  {compactAssignees.length > 0
                    ? compactAssignees.join(', ')
                    : 'Chưa phân công'}
                </span>
                <span aria-hidden="true" className="text-[#B8B0A0]">
                  ·
                </span>
                <span>{effCategory.category || 'Chưa phân hạng mục'}</span>
                {task.dueDate && (
                  <>
                    <span aria-hidden="true" className="text-[#B8B0A0]">
                      ·
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 font-mono-tabular ${
                        overdue
                          ? 'text-chu-sa font-semibold'
                          : 'text-[#5E697A]'
                      }`}
                    >
                      <Calendar className="w-3 h-3 shrink-0" />
                      <span>
                        {formatShortDate(task.dueDate)}
                        {overdue ? ' (Quá hạn)' : ''}
                      </span>
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Top-right Controls: Admin Overflow Menu + Close */}
            <div className="flex items-center gap-1 shrink-0">
              {isManager && !task.archivedAt && (
                <div ref={adminMenuRef} className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAdminMenu((v) => !v);
                      setConfirmArchive(false);
                    }}
                    aria-label="Thao tác quản trị"
                    aria-expanded={showAdminMenu}
                    className="w-9 h-9 flex items-center justify-center rounded-lg text-[#667182] hover:bg-[#EFEAE0] hover:text-huyen-lam transition-colors"
                  >
                    <MoreHorizontal className="w-[18px] h-[18px]" />
                  </button>

                  {showAdminMenu && (
                    <div className="absolute right-0 top-full mt-1.5 w-64 bg-trang-nga border border-[#DFD8CA] rounded-xl shadow-[0_14px_32px_-8px_rgba(20,36,63,0.22)] z-30 p-2">
                      {!confirmArchive ? (
                        <button
                          type="button"
                          onClick={() => setConfirmArchive(true)}
                          className="w-full px-3 py-2 text-left text-xs font-medium text-chu-sa hover:bg-chu-sa-soft rounded-lg flex items-center gap-2 transition-colors min-h-[38px]"
                        >
                          <Archive className="w-3.5 h-3.5 shrink-0" />
                          <span>Lưu trữ công việc</span>
                        </button>
                      ) : (
                        <div className="p-1.5 space-y-2">
                          <p className="text-xs text-huyen-lam leading-relaxed">
                            Chuyển công việc <strong>{task.displayCode}</strong>{' '}
                            vào danh sách lưu trữ?
                          </p>
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              disabled={archiving}
                              onClick={() => {
                                setConfirmArchive(false);
                                setShowAdminMenu(false);
                              }}
                              className="px-2.5 h-[30px] text-xs font-medium text-[#5E697A] hover:bg-[#EFEAE0] rounded-lg"
                            >
                              Hủy
                            </button>
                            <button
                              type="button"
                              disabled={archiving}
                              onClick={handleArchiveConfirmed}
                              className="px-2.5 h-[30px] text-xs font-semibold bg-chu-sa text-white rounded-lg hover:opacity-90 disabled:opacity-50"
                            >
                              {archiving ? 'Đang lưu trữ...' : 'Xác nhận'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <button
                type="button"
                onClick={() => handleIntent({ type: 'close' })}
                aria-label="Đóng chi tiết"
                className="w-9 h-9 flex items-center justify-center rounded-lg text-[#667182] hover:bg-[#EFEAE0] hover:text-huyen-lam transition-colors"
              >
                <X className="w-[18px] h-[18px]" />
              </button>
            </div>
          </div>
        </header>

        {/* Fixed Tabs Bar */}
        <nav
          aria-label="Mục chi tiết công việc"
          className="shrink-0 px-4 sm:px-5 bg-trang-nga border-b border-[#EAE3D5] flex items-center gap-6 text-[13px]"
        >
          <button
            type="button"
            onClick={() => handleIntent({ type: 'tab', tab: 'info' })}
            className={`h-[42px] border-b-2 font-medium transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'info'
                ? 'border-minh-kim text-huyen-lam font-semibold'
                : 'border-transparent text-[#6E7889] hover:text-huyen-lam'
            }`}
          >
            Chi tiết
          </button>
          <button
            type="button"
            onClick={() => handleIntent({ type: 'tab', tab: 'comments' })}
            className={`h-[42px] border-b-2 font-medium transition-colors whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 ${
              activeTab === 'comments'
                ? 'border-minh-kim text-huyen-lam font-semibold'
                : 'border-transparent text-[#6E7889] hover:text-huyen-lam'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5 shrink-0" />
            <span>Góp ý</span>
            {taskComments.length > 0 && (
              <span className="text-[11px] font-mono-tabular text-[#7D8796]">
                {taskComments.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => handleIntent({ type: 'tab', tab: 'history' })}
            className={`h-[42px] border-b-2 font-medium transition-colors whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 ${
              activeTab === 'history'
                ? 'border-minh-kim text-huyen-lam font-semibold'
                : 'border-transparent text-[#6E7889] hover:text-huyen-lam'
            }`}
          >
            <History className="w-3.5 h-3.5 shrink-0" />
            <span>Lịch sử</span>
            {taskLogs.length > 0 && (
              <span className="text-[11px] font-mono-tabular text-[#7D8796]">
                {taskLogs.length}
              </span>
            )}
          </button>
        </nav>

        {/* Single Scrollable Body */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 sm:px-5 py-4 space-y-5">
          {task.archivedAt && (
            <div className="px-3.5 py-2.5 rounded-xl bg-[#F4EFE4] border border-[#E2DAC9] flex flex-wrap items-center justify-between gap-2 text-xs text-huyen-lam">
              <span>
                Đã lưu trữ lúc {formatDateTime(task.archivedAt)}.
              </span>
              {isManager && (
                <button
                  type="button"
                  onClick={() => onRestoreTask(task.id)}
                  className="inline-flex items-center gap-1 font-semibold text-lam-tri-tue hover:text-huyen-lam hover:underline shrink-0"
                >
                  <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                  <span>Khôi phục</span>
                </button>
              )}
            </div>
          )}

          {(conflictError || (isEditing && loadedVersion !== task.version)) && (
            <div
              role="alert"
              className="px-3.5 py-3 rounded-xl bg-chu-sa-soft border border-chu-sa-border space-y-2"
            >
              <div className="flex items-start gap-2 text-xs text-chu-sa">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold">
                    {loadedVersion !== task.version
                      ? `Dữ liệu vừa được cập nhật mới hơn (v${task.version} so với bản bạn đang sửa v${loadedVersion})`
                      : 'Không thể lưu thay đổi'}
                  </div>
                  <p className="mt-0.5 text-chu-sa/90">
                    {conflictError ||
                      `Cập nhật gần nhất bởi ${
                        task.updatedBy ?? 'thành viên khác'
                      }. Hệ thống chặn ghi đè âm thầm để bảo vệ dữ liệu mới hơn.`}
                  </p>
                </div>
              </div>
              {loadedVersion !== task.version && (
                <button
                  type="button"
                  onClick={handleReloadLatest}
                  className="px-3 h-[32px] text-xs font-semibold bg-white border border-chu-sa-border text-chu-sa rounded-lg hover:bg-[#FFF5F5]"
                >
                  Tải bản mới nhất (v{task.version})
                </button>
              )}
            </div>
          )}

          {task.reviewFlags.length > 0 && (
            <div className="px-3.5 py-2.5 rounded-xl bg-minh-kim-soft/80 border border-minh-kim-border/70 text-xs text-minh-kim-ink flex items-start gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold">Cần rà soát: </span>
                <span>
                  {task.reviewFlags
                    .map((flag) => REVIEW_FLAG_LABELS[flag])
                    .join(' · ')}
                </span>
              </div>
            </div>
          )}

          {/* TAB: CHI TIẾT — VIEW MODE */}
          {activeTab === 'info' && !isEditing && (
            <div className="space-y-5">
              {/* A. Tổng quan */}
              <section className="space-y-3" aria-label="Tổng quan">
                <h3 className="text-[11.5px] font-semibold text-[#667182] tracking-[0.01em]">
                  Tổng quan
                </h3>

                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-3.5 text-[13px]">
                  <div className="min-w-0">
                    <dt className="text-xs text-[#737D8E]">Trạng thái</dt>
                    <dd className="mt-1 flex flex-wrap items-center gap-2">
                      <StatusBadge status={task.status} soft />
                      {task.status === 'Chờ duyệt' && (
                        <span className="text-[11.5px] text-minh-kim-ink">
                          {canApprove
                            ? 'Bấm Chỉnh sửa để phê duyệt'
                            : 'Đang chờ phê duyệt'}
                        </span>
                      )}
                    </dd>
                  </div>

                  <div className="min-w-0">
                    <dt className="text-xs text-[#737D8E]">Người phụ trách</dt>
                    <dd className="mt-1 font-medium text-huyen-lam">
                      {compactAssignees.length > 0
                        ? compactAssignees.join(', ')
                        : 'Chưa phân công'}
                      {isManager && (task.assigneeUids?.length ?? 0) === 0 && (
                        <span className="block text-[11px] font-normal text-minh-kim-ink mt-0.5">
                          Chưa liên kết tài khoản đăng nhập
                        </span>
                      )}
                    </dd>
                  </div>

                  <div className="min-w-0">
                    <dt className="text-xs text-[#737D8E]">Bước tiếp theo</dt>
                    <dd className="mt-1 text-huyen-lam break-words leading-relaxed">
                      {task.nextStep || (
                        <span className="text-[#8A94A3]">
                          Chưa ghi nhận bước tiếp theo
                        </span>
                      )}
                    </dd>
                  </div>

                  <div className="min-w-0">
                    <dt className="text-xs text-[#737D8E]">Hạn xử lý</dt>
                    <dd
                      className={`mt-1 font-mono-tabular ${
                        overdue
                          ? 'text-chu-sa font-semibold'
                          : 'text-huyen-lam font-medium'
                      }`}
                    >
                      {task.dueDate ? formatShortDate(task.dueDate) : 'Chưa đặt hạn'}
                    </dd>
                  </div>
                </dl>
              </section>

              {/* B. Tài liệu & Kết quả */}
              <section
                className="pt-4 border-t border-[#ECE6DA] space-y-3.5"
                aria-label="Tài liệu và Kết quả"
              >
                <h3 className="text-[11.5px] font-semibold text-[#667182] tracking-[0.01em]">
                  Tài liệu &amp; Kết quả
                </h3>

                <div className="space-y-1.5">
                  <div className="text-xs font-medium text-huyen-lam">
                    Kết quả nghiên cứu
                  </div>
                  {renderReadOnlyLinksList(
                    task.resultLinks,
                    'Chưa có liên kết kết quả nghiên cứu.',
                    'result'
                  )}
                </div>

                <div className="space-y-1.5">
                  <div className="text-xs font-medium text-huyen-lam/85">
                    Tài liệu tham khảo
                  </div>
                  {renderReadOnlyLinksList(
                    task.referenceLinks,
                    'Chưa có tài liệu tham khảo.',
                    'reference'
                  )}
                </div>
              </section>

              {/* C. Ghi chú */}
              <section
                className="pt-4 border-t border-[#ECE6DA] space-y-1.5"
                aria-label="Ghi chú"
              >
                <h3 className="text-[11.5px] font-semibold text-[#667182] tracking-[0.01em]">
                  Ghi chú
                </h3>
                {task.notes ? (
                  <p className="text-[13.5px] text-huyen-lam leading-relaxed whitespace-pre-wrap break-words">
                    {task.notes}
                  </p>
                ) : (
                  <p className="text-xs text-[#8A94A3]">Chưa có ghi chú.</p>
                )}
              </section>

              {/* D. Việc con (compact list only when present or allowed to add) */}
              {task.parentId === null &&
                (childTasks.length > 0 || canCreateSubHere) && (
                  <section
                    className="pt-4 border-t border-[#ECE6DA] space-y-2.5"
                    aria-label="Việc con"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <h3 className="text-[11.5px] font-semibold text-[#667182] tracking-[0.01em]">
                          Việc con
                        </h3>
                        {childProgress && childProgress.total > 0 && (
                          <span className="text-[11px] font-mono-tabular text-[#7D8796]">
                            {childProgress.completed}/{childProgress.total} hoàn
                            thành
                          </span>
                        )}
                      </div>
                      {canCreateSubHere && (
                        <button
                          type="button"
                          onClick={() => onOpenAddSubtask(task.id)}
                          className="inline-flex items-center gap-1 text-xs font-medium text-lam-tri-tue hover:text-huyen-lam py-1 px-2 rounded-lg hover:bg-[#F3EFE6] transition-colors min-h-[32px]"
                        >
                          <Plus className="w-3.5 h-3.5 shrink-0" />
                          <span>Thêm việc con</span>
                        </button>
                      )}
                    </div>

                    {childTasks.length > 0 && (
                      <div className="divide-y divide-[#EFEAE0] border border-[#E7E1D4] rounded-xl bg-white overflow-hidden">
                        {childTasks.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() =>
                              handleIntent({
                                type: 'select_task',
                                taskId: c.id,
                              })
                            }
                            className="w-full text-left px-3 py-2.5 hover:bg-[#FAF8F3] flex items-center justify-between gap-2.5 text-xs min-h-[42px] transition-colors"
                          >
                            <div className="min-w-0 truncate">
                              <span className="font-mono-tabular font-semibold text-huyen-lam mr-2">
                                {c.displayCode}
                              </span>
                              <span className="text-huyen-lam">
                                {c.title}
                              </span>
                            </div>
                            <StatusBadge status={c.status} soft compact />
                          </button>
                        ))}
                      </div>
                    )}
                  </section>
                )}

              {!canEdit && (
                <div className="pt-3 border-t border-[#ECE6DA] text-[11.5px] text-[#7D8796]">
                  {currentUser.role === 'viewer'
                    ? 'Bạn đang xem ở chế độ chỉ đọc.'
                    : 'Công việc này chưa được giao cho tài khoản của bạn.'}
                </div>
              )}
            </div>
          )}

          {/* TAB: CHI TIẾT — EDIT MODE */}
          {activeTab === 'info' && isEditing && canEdit && (
            <form
              id="task-detail-form"
              onSubmit={handleSave}
              className="space-y-5"
            >
              {/* A. Tổng quan (Editable fields based on user role) */}
              <section className="space-y-3" aria-label="Tổng quan">
                <h3 className="text-[11.5px] font-semibold text-[#667182] tracking-[0.01em]">
                  Tổng quan
                </h3>

                {/* Status & Contextual Workflow */}
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label
                      htmlFor="task-status-select"
                      className="text-xs font-medium text-[#434F63]"
                    >
                      Trạng thái
                    </label>
                    {statusDraftChanged && (
                      <span className="text-[11px] font-medium text-minh-kim-ink">
                        Nháp · chưa lưu lên hệ thống
                      </span>
                    )}
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                    <select
                      id="task-status-select"
                      value={statusValue}
                      disabled={statusLockedByCompletion}
                      onChange={(e) => setStatusValue(e.target.value)}
                      className={`${inputBaseClass} h-[38px] flex-1 disabled:bg-[#F4EFE4] disabled:text-[#7D8796]`}
                    >
                      <option value="">-- Chưa có trạng thái --</option>
                      {ALL_STATUSES.map((st) => {
                        const needApproval =
                          st === 'Hoàn thành' && !canApprove;
                        return (
                          <option
                            key={st}
                            value={st}
                            disabled={needApproval}
                          >
                            {st}
                            {needApproval ? ' (cần quyền duyệt)' : ''}
                          </option>
                        );
                      })}
                    </select>

                    {/* Contextual Draft Workflow Shortcuts */}
                    {!statusLockedByCompletion && (
                      <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                        {(statusValue === 'Đang làm' ||
                          statusValue === 'Tạm dừng' ||
                          statusValue === 'Chưa bắt đầu' ||
                          statusValue === '') && (
                          <button
                            type="button"
                            onClick={() => setStatusValue('Chờ duyệt')}
                            title="Chọn trạng thái Chờ duyệt trong bản nháp (bấm Lưu thay đổi để xác nhận)"
                            className="px-3 h-[38px] text-xs font-medium rounded-xl bg-[#FFE699]/75 border border-[#E8C868] text-[#5C4300] hover:bg-[#FFE699] transition-colors whitespace-nowrap"
                          >
                            Đặt Chờ duyệt
                          </button>
                        )}

                        {statusValue === 'Tạm dừng' && (
                          <button
                            type="button"
                            onClick={() => setStatusValue('Đang làm')}
                            className="px-3 h-[38px] text-xs font-medium rounded-xl bg-[#BDD7EE]/65 border border-[#9CC2E5] text-[#103A5C] hover:bg-[#BDD7EE] transition-colors whitespace-nowrap"
                          >
                            Tiếp tục làm
                          </button>
                        )}

                        {statusValue === 'Chờ duyệt' && canApprove && (
                          <button
                            type="button"
                            onClick={() => setStatusValue('Hoàn thành')}
                            title="Chọn Hoàn thành trong bản nháp (chỉ chính thức khi bấm Lưu thay đổi)"
                            className="px-3 h-[38px] text-xs font-semibold rounded-xl bg-[#A9D08E]/80 border border-[#8BBC6B] text-[#1E4612] hover:bg-[#A9D08E] transition-colors whitespace-nowrap"
                          >
                            Chọn Hoàn thành
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {statusLockedByCompletion ? (
                    <p className="text-[11.5px] text-[#6E7889]">
                      Công việc đã hoàn thành. Chỉ người có quyền phê duyệt mới
                      thay đổi lại trạng thái.
                    </p>
                  ) : statusValue === 'Chờ duyệt' && !canApprove ? (
                    <p className="text-[11.5px] text-minh-kim-ink">
                      Bấm Lưu thay đổi để gửi chờ người có quyền duyệt xác nhận.
                    </p>
                  ) : statusDraftChanged ? (
                    <p className="text-[11.5px] text-[#6E7889]">
                      Trạng thái mới chỉ là bản nháp — bấm{' '}
                      <strong className="text-huyen-lam">Lưu thay đổi</strong>{' '}
                      để cập nhật chính thức.
                    </p>
                  ) : null}
                </div>

                {/* Next Step + Due Date */}
                <div
                  className={`grid grid-cols-1 gap-3 ${
                    isManager ? 'sm:grid-cols-[minmax(0,1fr)_160px]' : ''
                  }`}
                >
                  <div className="min-w-0">
                    <label
                      htmlFor="task-next-step-input"
                      className="block text-xs font-medium text-[#434F63] mb-1"
                    >
                      Bước tiếp theo
                    </label>
                    <input
                      id="task-next-step-input"
                      type="text"
                      maxLength={500}
                      value={nextStep}
                      onChange={(e) => setNextStep(e.target.value)}
                      placeholder="Ví dụ: Hoàn thiện bản nháp, chờ duyệt..."
                      className={`${inputBaseClass} h-[38px]`}
                    />
                  </div>

                  {isManager ? (
                    <div className="min-w-0">
                      <label
                        htmlFor="task-due-date-input"
                        className="block text-xs font-medium text-[#434F63] mb-1"
                      >
                        Hạn xử lý
                      </label>
                      <input
                        id="task-due-date-input"
                        type="date"
                        value={dueDate}
                        onChange={(e) => setDueDate(e.target.value)}
                        className={`${inputBaseClass} h-[38px] font-mono-tabular`}
                      />
                    </div>
                  ) : task.dueDate ? (
                    <div className="text-xs text-[#667182]">
                      Hạn xử lý:{' '}
                      <span className="font-mono-tabular font-medium text-huyen-lam">
                        {formatShortDate(task.dueDate)}
                      </span>
                    </div>
                  ) : null}
                </div>

                {/* People Assignment (Manager only, compact short-name chips) */}
                {isManager && assignableMembers.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-[#434F63]">
                        Người được giao
                      </span>
                      <span
                        className={`text-[11px] font-medium tabular-nums ${
                          assigneeUids.length > 0
                            ? 'text-thanh-ngoc-ink'
                            : 'text-[#8A94A3]'
                        }`}
                      >
                        {assigneeUids.length > 0
                          ? `Đã chọn ${assigneeUids.length}`
                          : 'Chưa liên kết tài khoản'}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {assignableMembers.map((m) => {
                        const selected = assigneeUids.includes(m.uid);
                        const compactLabel = getCompactMemberLabel(m);
                        const hasDup = duplicateMemberLabels.has(
                          compactLabel.toLowerCase()
                        );
                        const emailPrefix = m.email.split('@')[0];
                        const tooltipText = [
                          compactLabel,
                          m.sheetAlias && m.sheetAlias !== compactLabel
                            ? `Tên gốc: ${m.sheetAlias}`
                            : '',
                          m.email,
                          !m.isActive ? 'Tài khoản đã khóa' : '',
                        ]
                          .filter(Boolean)
                          .join(' · ');

                        return (
                          <button
                            key={`assign_${m.uid}`}
                            type="button"
                            onClick={() => {
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
                            aria-pressed={selected}
                            title={tooltipText}
                            className={`inline-flex items-center gap-1.5 h-[34px] px-2.5 rounded-lg border text-xs font-medium transition-colors whitespace-nowrap ${
                              !m.isActive
                                ? selected
                                  ? 'bg-chu-sa text-white border-chu-sa'
                                  : 'bg-chu-sa-soft border-chu-sa-border text-chu-sa'
                                : selected
                                ? 'bg-huyen-lam border-huyen-lam text-trang-nga font-semibold'
                                : 'bg-white border-[#DFD8CA] text-huyen-lam hover:bg-[#FAF8F3]'
                            }`}
                          >
                            <span
                              className={`w-3.5 h-3.5 rounded flex items-center justify-center shrink-0 ${
                                selected
                                  ? 'bg-kim-quang text-huyen-lam'
                                  : 'border border-[#CBC2B0] bg-[#FAF8F3]'
                              }`}
                              aria-hidden="true"
                            >
                              {selected && (
                                <Check className="w-2.5 h-2.5 stroke-[2.75]" />
                              )}
                            </span>
                            <span>{compactLabel}</span>
                            {hasDup && (
                              <span
                                className={`text-[10.5px] font-normal ${
                                  selected ? 'text-slate-200' : 'text-[#7D8796]'
                                }`}
                              >
                                ({emailPrefix})
                              </span>
                            )}
                            {!m.isActive && (
                              <span className="text-[10px] opacity-85">
                                (Khóa)
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </section>

              {/* B. Tài liệu & Kết quả (Edit Mode: edit/delete/add) */}
              <section
                className="pt-4 border-t border-[#ECE6DA] space-y-3"
                aria-label="Tài liệu và Kết quả"
              >
                <h3 className="text-[11.5px] font-semibold text-[#667182] tracking-[0.01em]">
                  Tài liệu &amp; Kết quả
                </h3>

                <div className="space-y-1.5">
                  <div className="text-xs font-medium text-huyen-lam">
                    Kết quả nghiên cứu
                  </div>
                  {renderEditableLinksGroup(
                    resultLinks,
                    'result',
                    'Chưa có liên kết kết quả nghiên cứu.'
                  )}
                </div>

                <div className="space-y-1.5">
                  <div className="text-xs font-medium text-huyen-lam/85">
                    Tài liệu tham khảo
                  </div>
                  {renderEditableLinksGroup(
                    referenceLinks,
                    'reference',
                    'Chưa có tài liệu tham khảo.'
                  )}
                </div>

                {/* Add new link bar */}
                <div className="pt-1.5 space-y-2">
                  <div className="text-[11.5px] font-medium text-[#5E697A]">
                    Thêm liên kết mới
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                    <select
                      aria-label="Loại liên kết"
                      value={newUrlType}
                      onChange={(e) =>
                        setNewUrlType(e.target.value as 'result' | 'reference')
                      }
                      className="sm:col-span-3 h-[36px] px-2.5 text-xs bg-white border border-[#DFD8CA] rounded-xl text-huyen-lam focus:outline-none focus:ring-2 focus:ring-lam-sang/25 focus:border-lam-sang"
                    >
                      <option value="result">Kết quả</option>
                      <option value="reference">Tham khảo</option>
                    </select>
                    <input
                      type="text"
                      value={newUrlLabel}
                      onChange={(e) => setNewUrlLabel(e.target.value)}
                      placeholder="Nhãn tài liệu"
                      aria-label="Nhãn liên kết mới"
                      className="sm:col-span-4 h-[36px] px-2.5 text-xs bg-white border border-[#DFD8CA] rounded-xl text-huyen-lam placeholder:text-[#969EAE] focus:outline-none focus:ring-2 focus:ring-lam-sang/25 focus:border-lam-sang"
                    />
                    <input
                      type="url"
                      value={newUrlValue}
                      onChange={(e) => setNewUrlValue(e.target.value)}
                      placeholder="https://drive.google.com/..."
                      aria-label="URL liên kết mới"
                      className="sm:col-span-5 h-[36px] px-2.5 text-xs font-mono-tabular bg-white border border-[#DFD8CA] rounded-xl text-huyen-lam placeholder:text-[#969EAE] focus:outline-none focus:ring-2 focus:ring-lam-sang/25 focus:border-lam-sang"
                    />
                  </div>
                  {newUrlValue.trim() && (
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={handleAddLink}
                        className="inline-flex items-center gap-1 px-3 h-[34px] text-xs font-semibold bg-[#EFEAE0] hover:bg-[#E6DFD2] text-huyen-lam rounded-lg transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Thêm vào danh sách</span>
                      </button>
                    </div>
                  )}
                </div>
              </section>

              {/* C. Ghi chú */}
              <section
                className="pt-4 border-t border-[#ECE6DA] space-y-1.5"
                aria-label="Ghi chú"
              >
                <label
                  htmlFor="task-notes-input"
                  className="block text-[11.5px] font-semibold text-[#667182] tracking-[0.01em]"
                >
                  Ghi chú
                </label>
                <textarea
                  id="task-notes-input"
                  rows={3}
                  maxLength={2000}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ghi chú nội dung hoặc trao đổi thêm..."
                  className="w-full px-3 py-2 text-[13.5px] bg-white border border-[#DFD8CA] rounded-xl text-huyen-lam placeholder:text-[#969EAE] focus:outline-none focus:ring-2 focus:ring-lam-sang/25 focus:border-lam-sang"
                />
              </section>

              {/* Expandable Quản lý công việc (Manager only: infrequent fields) */}
              {isManager && (
                <section
                  className="pt-4 border-t border-[#ECE6DA]"
                  aria-label="Quản lý công việc"
                >
                  <button
                    type="button"
                    onClick={() => setShowManageSection((v) => !v)}
                    aria-expanded={showManageSection}
                    className="w-full flex items-center justify-between gap-2 py-1.5 text-left group"
                  >
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-huyen-lam group-hover:text-lam-tri-tue transition-colors">
                      <FolderOpen className="w-3.5 h-3.5 text-minh-kim-ink shrink-0" />
                      <span>Quản lý công việc</span>
                    </span>
                    <ChevronDown
                      className={`w-4 h-4 text-[#7D8796] transition-transform duration-150 ${
                        showManageSection ? 'rotate-180' : ''
                      }`}
                    />
                  </button>

                  {showManageSection && (
                    <div className="mt-3 space-y-3 pt-1">
                      <div className="grid grid-cols-1 sm:grid-cols-[100px_minmax(0,1fr)] gap-2.5">
                        <div className="min-w-0">
                          <label
                            htmlFor="task-code-input"
                            className="block text-xs font-medium text-[#434F63] mb-1"
                          >
                            Mã hiển thị
                          </label>
                          <input
                            id="task-code-input"
                            type="text"
                            maxLength={24}
                            value={displayCode}
                            onChange={(e) => setDisplayCode(e.target.value)}
                            className={`${inputBaseClass} h-[36px] font-mono-tabular`}
                          />
                        </div>
                        <div className="min-w-0">
                          <label
                            htmlFor="task-title-input"
                            className="block text-xs font-medium text-[#434F63] mb-1"
                          >
                            Tên công việc
                          </label>
                          <input
                            id="task-title-input"
                            type="text"
                            maxLength={300}
                            value={title}
                            onChange={(e) => {
                              setTitle(e.target.value);
                              if (titleError && e.target.value.trim()) {
                                setTitleError(null);
                              }
                            }}
                            aria-invalid={Boolean(titleError)}
                            className={`${inputBaseClass} h-[36px] ${
                              titleError ? 'border-chu-sa' : ''
                            }`}
                          />
                          {titleError && (
                            <p className="mt-1 text-[11.5px] font-medium text-chu-sa">
                              {titleError}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div className="min-w-0">
                          <label
                            htmlFor="task-category-select"
                            className="block text-xs font-medium text-[#434F63] mb-1"
                          >
                            Hạng mục
                          </label>
                          <select
                            id="task-category-select"
                            value={categoryId}
                            onChange={(e) => setCategoryId(e.target.value)}
                            className={`${inputBaseClass} h-[36px]`}
                          >
                            <option value="">
                              {effCategory.inherited
                                ? `Kế thừa từ cha (${effCategory.category})`
                                : 'Chưa phân hạng mục'}
                            </option>
                            {sortedCategories
                              .filter(
                                (cat) => cat.isActive || cat.id === categoryId
                              )
                              .map((cat) => (
                                <option key={cat.id} value={cat.id}>
                                  {cat.name}
                                  {!cat.isActive ? ' (Ngừng dùng)' : ''}
                                </option>
                              ))}
                          </select>
                        </div>

                        <div className="min-w-0">
                          <label
                            htmlFor="task-assignees-text"
                            className="block text-xs font-medium text-[#434F63] mb-1"
                          >
                            Tên phụ trách hiển thị
                          </label>
                          <input
                            id="task-assignees-text"
                            type="text"
                            value={assigneesText}
                            onChange={(e) => setAssigneesText(e.target.value)}
                            placeholder="VD: Quốc, Khả Tuệ"
                            className={`${inputBaseClass} h-[36px]`}
                          />
                        </div>
                      </div>

                      {approverMembers.length > 0 && (
                        <div className="space-y-1.5 pt-1">
                          <div className="text-xs font-medium text-[#434F63]">
                            Người có quyền duyệt bổ sung
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {approverMembers.map((m) => {
                              const checked = approverUids.includes(m.uid);
                              const label = getCompactMemberLabel(m);
                              return (
                                <button
                                  key={`appr_${m.uid}`}
                                  type="button"
                                  onClick={() =>
                                    setApproverUids((prev) =>
                                      toggleUid(prev, m.uid)
                                    )
                                  }
                                  aria-pressed={checked}
                                  className={`inline-flex items-center gap-1.5 h-[32px] px-2.5 rounded-lg border text-xs font-medium transition-colors ${
                                    checked
                                      ? 'bg-minh-kim-soft border-minh-kim text-minh-kim-ink font-semibold'
                                      : 'bg-white border-[#DFD8CA] text-[#5E697A] hover:text-huyen-lam'
                                  }`}
                                >
                                  {checked && (
                                    <Check className="w-3 h-3 shrink-0" />
                                  )}
                                  <span>{label}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </section>
              )}
            </form>
          )}

          {/* TAB: GÓP Ý */}
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
                    placeholder={`Viết góp ý dưới tên ${getCompactMemberLabel(
                      currentUser
                    )}...`}
                    className="w-full px-3 py-2 text-[13.5px] bg-white border border-[#DFD8CA] rounded-xl text-huyen-lam placeholder:text-[#969EAE] focus:outline-none focus:ring-2 focus:ring-lam-sang/25 focus:border-lam-sang disabled:bg-[#FAF8F3]"
                  />
                  {commentError && (
                    <div
                      role="alert"
                      className="px-3 py-2 rounded-xl bg-chu-sa-soft border border-chu-sa-border text-xs text-chu-sa"
                    >
                      {commentError}
                    </div>
                  )}
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={!commentText.trim() || postingComment}
                      className="inline-flex items-center gap-1.5 px-4 h-[38px] text-xs font-semibold bg-huyen-lam text-trang-nga rounded-xl disabled:opacity-40 hover:bg-lam-tri-tue transition-colors"
                    >
                      <Send className="w-3.5 h-3.5 shrink-0" />
                      <span>{postingComment ? 'Đang gửi...' : 'Gửi góp ý'}</span>
                    </button>
                  </div>
                </form>
              ) : (
                <p className="text-xs text-[#7D8796]">
                  Vai trò Viewer chỉ xem được các góp ý hiện có.
                </p>
              )}

              <div className="divide-y divide-[#ECE6DA] border-t border-[#ECE6DA]">
                {taskComments.length === 0 ? (
                  <p className="text-xs text-[#8A94A3] py-8 text-center">
                    Chưa có góp ý nào cho công việc này.
                  </p>
                ) : (
                  taskComments.map((c) => (
                    <div key={c.id} className="py-3 space-y-1">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-semibold text-huyen-lam">
                          {toCompactAliasDisplay(c.authorName)}
                        </span>
                        <span className="font-mono-tabular text-[11px] text-[#7D8796]">
                          {formatDateTime(c.createdAt)}
                        </span>
                      </div>
                      <p className="text-[13.5px] text-huyen-lam/90 whitespace-pre-wrap break-words leading-relaxed">
                        {c.content}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB: LỊCH SỬ */}
          {activeTab === 'history' && (
            <div className="space-y-4">
              {taskLogs.length === 0 ? (
                <p className="text-xs text-[#8A94A3] py-8 text-center">
                  Chưa có lịch sử cập nhật nào.
                </p>
              ) : (
                <div className="divide-y divide-[#ECE6DA] border-t border-[#ECE6DA]">
                  {taskLogs.map((log) => (
                    <div key={log.id} className="py-2.5 space-y-0.5 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-huyen-lam">
                          {toCompactAliasDisplay(log.actorName)}
                        </span>
                        <span className="font-mono-tabular text-[11px] text-[#7D8796]">
                          {formatDateTime(log.createdAt)}
                        </span>
                      </div>
                      <p className="text-[#5E697A] break-words leading-relaxed">
                        {log.summary}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {/* Subtle technical reference metadata moved out of Header */}
              <div className="pt-3 border-t border-[#ECE6DA] flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#8A94A3]">
                <span>
                  Cập nhật: {formatDateTime(task.updatedAt)}
                  {task.updatedBy
                    ? ` · ${toCompactAliasDisplay(task.updatedBy)}`
                    : ''}
                </span>
                <span className="font-mono-tabular">
                  {task.id} · v{task.version}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Smart Fixed Footer (Chi tiết tab) */}
        {activeTab === 'info' && (
          <footer className="shrink-0 px-4 sm:px-5 py-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-[#FAF8F3] border-t border-[#EAE3D5] space-y-2">
            {saveFeedback && !pendingAction && (
              <div
                role={saveFeedback.type === 'error' ? 'alert' : 'status'}
                className={`text-xs flex items-center gap-1.5 ${
                  saveFeedback.type === 'success'
                    ? 'text-thanh-ngoc-ink font-medium'
                    : 'text-chu-sa font-medium'
                }`}
              >
                {saveFeedback.type === 'success' ? (
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                ) : (
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                )}
                <span className="break-words">{saveFeedback.text}</span>
              </div>
            )}

            {pendingAction ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-medium text-chu-sa">
                  Có thay đổi chưa lưu. Bạn muốn bỏ bản nháp?
                </span>
                <div className="flex items-center gap-2 ml-auto">
                  <button
                    type="button"
                    onClick={() => setPendingAction(null)}
                    className="px-3 h-[36px] text-xs font-medium text-huyen-lam hover:bg-[#EFEAE0] rounded-lg transition-colors"
                  >
                    Tiếp tục sửa
                  </button>
                  <button
                    type="button"
                    onClick={() => executePendingAction(pendingAction)}
                    className="px-3 h-[36px] text-xs font-semibold bg-chu-sa text-white rounded-lg hover:opacity-90 transition-opacity"
                  >
                    Bỏ thay đổi
                  </button>
                </div>
              </div>
            ) : isEditing && canEdit ? (
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => handleIntent({ type: 'cancel_edit' })}
                  className="px-4 h-[40px] text-[13.5px] font-medium text-[#5E697A] hover:text-huyen-lam hover:bg-[#EFEAE0] rounded-xl transition-colors disabled:opacity-50"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  form="task-detail-form"
                  disabled={!isDirty || saving}
                  aria-busy={saving}
                  className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-5 h-[40px] text-[13.5px] font-semibold bg-huyen-lam text-trang-nga rounded-xl hover:bg-lam-tri-tue disabled:opacity-45 transition-colors"
                >
                  <Save className="w-4 h-4 shrink-0" />
                  <span>{saving ? 'Đang lưu...' : 'Lưu thay đổi'}</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-[#7D8796] truncate">
                  {canEdit
                    ? `Cập nhật ${formatDateTime(task.updatedAt)}`
                    : 'Chế độ chỉ xem'}
                </span>
                {canEdit ? (
                  <button
                    type="button"
                    onClick={startEditing}
                    className="inline-flex items-center justify-center gap-1.5 px-4 h-[40px] text-[13.5px] font-semibold bg-huyen-lam text-trang-nga rounded-xl hover:bg-lam-tri-tue transition-colors shrink-0"
                  >
                    <Pencil className="w-3.5 h-3.5 shrink-0" />
                    <span>Chỉnh sửa</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleIntent({ type: 'close' })}
                    className="px-4 h-[40px] text-[13.5px] font-medium text-huyen-lam hover:bg-[#EFEAE0] rounded-xl transition-colors shrink-0"
                  >
                    Đóng
                  </button>
                )}
              </div>
            )}
          </footer>
        )}

        {/* Unsaved guard footer banner if pendingAction was triggered from Comments/History tab? */}
        {activeTab !== 'info' && pendingAction && (
          <footer className="shrink-0 px-4 sm:px-5 py-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-[#FAF8F3] border-t border-[#EAE3D5]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-medium text-chu-sa">
                Có thay đổi chưa lưu. Bạn muốn bỏ bản nháp?
              </span>
              <div className="flex items-center gap-2 ml-auto">
                <button
                  type="button"
                  onClick={() => setPendingAction(null)}
                  className="px-3 h-[36px] text-xs font-medium text-huyen-lam hover:bg-[#EFEAE0] rounded-lg"
                >
                  Tiếp tục sửa
                </button>
                <button
                  type="button"
                  onClick={() => executePendingAction(pendingAction)}
                  className="px-3 h-[36px] text-xs font-semibold bg-chu-sa text-white rounded-lg"
                >
                  Bỏ thay đổi
                </button>
              </div>
            </div>
          </footer>
        )}
      </div>
    </div>
  );
};
