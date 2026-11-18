import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  ChevronDown,
  Plus,
  Search,
  X,
} from 'lucide-react';
import {
  CategoryItem,
  ProjectMember,
  TaskCategory,
  TaskItem,
  TaskStatus,
} from '../types/project';
import {
  ALL_STATUSES,
  canBeParent,
  canUserCreateSubtaskInParent,
  getEffectiveCategory,
  isB1TestTask,
} from '../utils/taskHelpers';
import {
  EXPECTED_TBHGN_ACCOUNTS,
  isReplacedTemporaryAccountEmail,
  isTemporaryAccountEmail,
} from '../utils/memberMapping';

interface NewTaskModalProps {
  isOpen: boolean;
  defaultParentId: string | null;
  tasks: TaskItem[];
  members: ProjectMember[];
  categories: CategoryItem[];
  currentUser: ProjectMember;
  onClose: () => void;
  onCreateTask: (input: {
    displayCode: string;
    title: string;
    parentId: string | null;
    categoryId: string | null;
    category: TaskCategory | null;
    assignees: string[];
    assigneeUids: string[];
    status: TaskStatus | null;
    nextStep: string | null;
    dueDate: string | null;
  }) => Promise<void>;
}

type TaskMode = 'main' | 'subtask';

function getCompactMemberLabel(member: ProjectMember): string {
  const emailNorm = member.email?.trim().toLowerCase() ?? '';
  const expected = EXPECTED_TBHGN_ACCOUNTS.find(
    (acc) => acc.email.toLowerCase() === emailNorm
  );
  if (expected) return expected.displayName;
  const dn = member.displayName?.trim();
  if (dn && dn.toLowerCase() !== 'admin') return dn;
  const sa = member.sheetAlias?.trim();
  if (sa) return sa;
  return member.email?.split('@')[0] || 'Thành viên';
}

function getCategoryDotColor(
  categoryId: string | null,
  categoryName: string
): string {
  const nameKey = categoryName.trim().toLowerCase();
  if (categoryId === 'cat_outline' || nameKey.includes('đề cương')) {
    return '#477FAE';
  }
  if (categoryId === 'cat_foundation' || nameKey.includes('nền tảng')) {
    return '#328578';
  }
  if (categoryId === 'cat_research' || nameKey.includes('truy nguồn')) {
    return '#C9A14B';
  }
  return '#8A94A3';
}

export const NewTaskModal: React.FC<NewTaskModalProps> = ({
  isOpen,
  defaultParentId,
  tasks,
  members,
  categories,
  currentUser,
  onClose,
  onCreateTask,
}) => {
  const isManager =
    (currentUser.role === 'admin' || currentUser.role === 'moderator') &&
    currentUser.isActive;

  const activeCategories = useMemo(
    () =>
      categories
        .filter((c) => c.isActive)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [categories]
  );

  // Admin & Moderator see all active official parent tasks; Member sees ONLY active official parent tasks assigned to their UID
  const eligibleParents = useMemo(() => {
    return tasks
      .filter((t) => !isB1TestTask(t) && t.parentId === null && !t.archivedAt)
      .filter((p) => canUserCreateSubtaskInParent(currentUser, p))
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }, [tasks, currentUser]);

  // Active & eligible members for assignment (exclude viewers and replaced temporary emails)
  const assignableMembers = useMemo(() => {
    return members.filter(
      (m) =>
        m.isActive &&
        m.role !== 'viewer' &&
        !isReplacedTemporaryAccountEmail(m.email)
    );
  }, [members]);

  const duplicateLabels = useMemo(() => {
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

  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const parentPickerRef = useRef<HTMLDivElement | null>(null);
  const parentSearchRef = useRef<HTMLInputElement | null>(null);

  const [taskMode, setTaskMode] = useState<TaskMode>('main');
  const [parentId, setParentId] = useState<string>('');
  const [parentPickerOpen, setParentPickerOpen] = useState(false);
  const [parentSearch, setParentSearch] = useState('');
  const [displayCode, setDisplayCode] = useState('');
  const [title, setTitle] = useState('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [assigneeUids, setAssigneeUids] = useState<string[]>([]);
  const [showExtraAlias, setShowExtraAlias] = useState(false);
  const [customAssigneeNote, setCustomAssigneeNote] = useState('');
  const [status, setStatus] = useState<TaskStatus>('Chưa bắt đầu');
  const [nextStep, setNextStep] = useState('');
  const [dueDate, setDueDate] = useState('');

  const [titleError, setTitleError] = useState<string | null>(null);
  const [parentError, setParentError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const selectedParent = useMemo(
    () => eligibleParents.find((p) => p.id === parentId) ?? null,
    [eligibleParents, parentId]
  );

  const filteredParents = useMemo(() => {
    const q = parentSearch.trim().toLowerCase();
    if (!q) return eligibleParents;
    return eligibleParents.filter((p) =>
      `${p.displayCode} ${p.title}`.toLowerCase().includes(q)
    );
  }, [eligibleParents, parentSearch]);

  useEffect(() => {
    if (!isOpen) return;
    const hasExplicitParent =
      Boolean(defaultParentId) &&
      eligibleParents.some((p) => p.id === defaultParentId);

    const nextMode: TaskMode = !isManager || hasExplicitParent ? 'subtask' : 'main';
    const nextParent = hasExplicitParent
      ? defaultParentId ?? ''
      : !isManager
      ? eligibleParents[0]?.id ?? ''
      : '';

    setTaskMode(nextMode);
    setParentId(nextParent);
    setParentPickerOpen(false);
    setParentSearch('');
    setDisplayCode('');
    setTitle('');

    if (nextParent) {
      const pObj = eligibleParents.find((p) => p.id === nextParent);
      setCategoryId(pObj?.categoryId ?? '');
    } else {
      setCategoryId(activeCategories[0]?.id ?? '');
    }

    setAssigneeUids(isManager ? [] : [currentUser.uid]);
    setShowExtraAlias(false);
    setCustomAssigneeNote('');
    setStatus('Chưa bắt đầu');
    setNextStep('');
    setDueDate('');
    setTitleError(null);
    setParentError(null);
    setSubmitError(null);
    setConfirmDiscard(false);
    setSubmitting(false);

    const rafId = window.requestAnimationFrame(() => {
      titleInputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(rafId);
  }, [isOpen, defaultParentId, isManager, currentUser.uid]);

  // Inherit parent's categoryId automatically when parent selection changes
  useEffect(() => {
    if (!isOpen) return;
    if (taskMode === 'subtask' && selectedParent) {
      setCategoryId(selectedParent.categoryId ?? '');
    }
  }, [taskMode, selectedParent?.id, selectedParent?.categoryId, isOpen]);

  // Clear discard confirmation automatically if user resumes editing
  useEffect(() => {
    setConfirmDiscard(false);
  }, [
    title,
    displayCode,
    parentId,
    categoryId,
    status,
    nextStep,
    dueDate,
    customAssigneeNote,
  ]);

  useEffect(() => {
    if (!parentPickerOpen) return;
    const handlePointerDown = (e: PointerEvent) => {
      if (
        parentPickerRef.current &&
        !parentPickerRef.current.contains(e.target as Node)
      ) {
        setParentPickerOpen(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    const rafId = window.requestAnimationFrame(() => {
      parentSearchRef.current?.focus();
    });
    return () => {
      window.cancelAnimationFrame(rafId);
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [parentPickerOpen]);

  const isDirty = useMemo(() => {
    if (!isOpen) return false;
    const defaultMode: TaskMode =
      !isManager ||
      (Boolean(defaultParentId) &&
        eligibleParents.some((p) => p.id === defaultParentId))
        ? 'subtask'
        : 'main';
    const initialUids = isManager ? [] : [currentUser.uid];
    const uidsChanged =
      assigneeUids.length !== initialUids.length ||
      assigneeUids.some((u, idx) => u !== initialUids[idx]);

    return (
      title.trim() !== '' ||
      displayCode.trim() !== '' ||
      nextStep.trim() !== '' ||
      dueDate !== '' ||
      customAssigneeNote.trim() !== '' ||
      status !== 'Chưa bắt đầu' ||
      taskMode !== defaultMode ||
      uidsChanged
    );
  }, [
    isOpen,
    isManager,
    defaultParentId,
    eligibleParents,
    currentUser.uid,
    assigneeUids,
    title,
    displayCode,
    nextStep,
    dueDate,
    customAssigneeNote,
    status,
    taskMode,
  ]);

  const requestClose = () => {
    if (submitting) return;
    if (isDirty && !confirmDiscard) {
      setConfirmDiscard(true);
      return;
    }
    onClose();
  };

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (parentPickerOpen) {
        e.stopPropagation();
        setParentPickerOpen(false);
        return;
      }
      if (confirmDiscard) {
        e.stopPropagation();
        setConfirmDiscard(false);
        return;
      }
      requestClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, parentPickerOpen, confirmDiscard, isDirty, submitting]);

  if (!isOpen) return null;

  const memberCannotCreate = !isManager && eligibleParents.length === 0;

  const handleModeChange = (nextMode: TaskMode) => {
    if (!isManager) return;
    setTaskMode(nextMode);
    setParentError(null);
    setConfirmDiscard(false);
    if (nextMode === 'main') {
      setParentId('');
      setParentPickerOpen(false);
      setParentSearch('');
      if (!categoryId && activeCategories[0]) {
        setCategoryId(activeCategories[0].id);
      }
    }
  };

  const suggestedCode = (() => {
    const visibleTasks = tasks.filter((t) => !isB1TestTask(t) && !t.archivedAt);
    if (taskMode === 'main' || !parentId) {
      const allParentsCount = visibleTasks.filter(
        (t) => t.parentId === null
      ).length;
      return `${allParentsCount + 1}`;
    }
    const siblings = visibleTasks.filter((t) => t.parentId === parentId);
    return selectedParent
      ? `${selectedParent.displayCode}.${siblings.length + 1}`
      : '1.1';
  })();

  const toggleUid = (uid: string) => {
    setConfirmDiscard(false);
    setAssigneeUids((prev) =>
      prev.includes(uid) ? prev.filter((u) => u !== uid) : [...prev, uid]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || memberCannotCreate) return;
    setTitleError(null);
    setParentError(null);
    setSubmitError(null);

    const cleanParentId = taskMode === 'subtask' ? parentId || null : null;
    let hasValidationError = false;

    if (taskMode === 'subtask' && !cleanParentId) {
      setParentError(
        isManager
          ? 'Vui lòng chọn công việc chính chứa việc con này.'
          : 'Bạn chỉ có thể tạo việc con thuộc một công việc chính đã được giao.'
      );
      hasValidationError = true;
    }

    if (!title.trim()) {
      setTitleError('Vui lòng nhập tên công việc.');
      hasValidationError = true;
    }

    if (hasValidationError) {
      if (taskMode === 'subtask' && !cleanParentId) {
        setParentPickerOpen(true);
      } else if (!title.trim()) {
        titleInputRef.current?.focus();
      }
      return;
    }

    const validation = canBeParent(cleanParentId, null, tasks);
    if (!validation.ok) {
      setParentError(
        validation.reason || 'Công việc chính được chọn không hợp lệ.'
      );
      return;
    }

    const effectiveCatId = cleanParentId
      ? isManager
        ? categoryId || selectedParent?.categoryId || null
        : selectedParent?.categoryId || null
      : categoryId || null;

    const matchedCategory = categories.find((c) => c.id === effectiveCatId);

    const resolvedUids = isManager ? assigneeUids : [currentUser.uid];
    const uidNames = resolvedUids
      .map((uid) => {
        const matched =
          members.find((m) => m.uid === uid) ??
          (uid === currentUser.uid ? currentUser : undefined);
        return matched ? getCompactMemberLabel(matched) : '';
      })
      .filter((n): n is string => Boolean(n));

    const extraNames = isManager
      ? customAssigneeNote
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
    const displayNames = Array.from(new Set([...uidNames, ...extraNames]));

    setSubmitting(true);
    try {
      await onCreateTask({
        displayCode: displayCode.trim() || suggestedCode,
        title: title.trim(),
        parentId: cleanParentId,
        categoryId: effectiveCatId,
        category: matchedCategory?.name ?? null,
        assignees: displayNames,
        assigneeUids: resolvedUids,
        status,
        nextStep: nextStep.trim() || null,
        dueDate: dueDate || null,
      });
      onClose();
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : 'Không thể tạo công việc.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const parentCatMeta = selectedParent
    ? getEffectiveCategory(selectedParent, tasks, categories)
    : null;

  const fieldBase =
    'w-full px-3 text-[13.5px] bg-white border rounded-xl text-huyen-lam placeholder:text-[#969EAE] focus:outline-none focus:ring-2 transition-colors';
  const normalFieldClass = `${fieldBase} h-[36px] border-[#DFD8CA] focus:ring-lam-sang/25 focus:border-lam-sang`;

  return (
    <div
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          requestClose();
        }
      }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-huyen-lam/45 backdrop-blur-[1.5px] p-0 sm:p-4 overscroll-contain"
      role="dialog"
      aria-modal="true"
      aria-label={isManager ? 'Thêm đầu việc mới' : 'Thêm việc con'}
    >
      <div className="bg-trang-nga w-full sm:max-w-[540px] rounded-t-2xl sm:rounded-2xl border border-[#E5DFD2] shadow-[0_20px_48px_-12px_rgba(20,36,63,0.28)] flex flex-col max-h-[90dvh] sm:max-h-[86dvh] overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3 bg-[#FAF8F3] border-b border-[#EAE3D5] flex items-center justify-between shrink-0">
          <h2 className="text-[15.5px] font-semibold text-huyen-lam tracking-[-0.01em]">
            {!isManager || taskMode === 'subtask'
              ? 'Thêm việc con'
              : 'Thêm đầu việc mới'}
          </h2>
          <button
            type="button"
            onClick={requestClose}
            aria-label="Đóng"
            className="w-8 h-8 flex items-center justify-center rounded-lg text-[#6E7889] hover:bg-[#EFEAE0] hover:text-huyen-lam transition-colors"
          >
            <X className="w-[18px] h-[18px] shrink-0" />
          </button>
        </div>

        {memberCannotCreate ? (
          <div className="p-5 space-y-4">
            <div className="p-3.5 rounded-xl bg-minh-kim-soft border border-minh-kim-border text-xs sm:text-sm text-minh-kim-ink flex items-start gap-2.5">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="font-semibold">
                  Chưa có công việc chính nào được giao cho bạn
                </div>
                <p>
                  Tài khoản Thành viên chỉ được thêm <strong>việc con</strong> vào nhóm công việc mà bạn đang phụ trách. Vui lòng liên hệ Quản trị viên để được phân công trước.
                </p>
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-4 h-[36px] text-sm font-semibold bg-huyen-lam text-trang-nga rounded-xl hover:bg-lam-tri-tue transition-colors"
              >
                Đã hiểu
              </button>
            </div>
          </div>
        ) : (
          <form
            noValidate
            onSubmit={handleSubmit}
            className="flex flex-col flex-1 min-h-0"
          >
            {/* Scrollable Body */}
            <div className="flex-1 overflow-y-auto px-5 py-3.5 space-y-3.5 overscroll-contain">
              {/* Nhóm 1 — Công việc */}
              <section className="space-y-2.5" aria-label="Công việc">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11.5px] font-semibold text-[#5B6678] tracking-[0.01em]">
                    Công việc
                  </span>

                  {/* Segmented Task Type Control */}
                  {isManager ? (
                    <div
                      role="group"
                      aria-label="Loại công việc"
                      className="inline-flex items-center p-0.5 rounded-lg bg-[#EFEAE0] border border-[#E3DDD0]"
                    >
                      <button
                        type="button"
                        onClick={() => handleModeChange('main')}
                        aria-pressed={taskMode === 'main'}
                        className={`h-[28px] px-2.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                          taskMode === 'main'
                            ? 'bg-white text-huyen-lam font-semibold shadow-[0_1px_2px_rgba(20,36,63,0.08)]'
                            : 'text-[#5E697A] hover:text-huyen-lam'
                        }`}
                      >
                        Việc chính
                      </button>
                      <button
                        type="button"
                        onClick={() => handleModeChange('subtask')}
                        aria-pressed={taskMode === 'subtask'}
                        className={`h-[28px] px-2.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                          taskMode === 'subtask'
                            ? 'bg-white text-huyen-lam font-semibold shadow-[0_1px_2px_rgba(20,36,63,0.08)]'
                            : 'text-[#5E697A] hover:text-huyen-lam'
                        }`}
                      >
                        Việc con
                      </button>
                    </div>
                  ) : (
                    <span className="text-xs font-medium text-thanh-ngoc-ink">
                      Việc con
                    </span>
                  )}
                </div>

                {/* Conditional Searchable Parent Picker (shown ONLY for Việc con) */}
                {taskMode === 'subtask' && (
                  <div
                    ref={parentPickerRef}
                    onBlur={(e) => {
                      if (
                        parentPickerOpen &&
                        !e.currentTarget.contains(e.relatedTarget as Node)
                      ) {
                        setParentPickerOpen(false);
                      }
                    }}
                    className="relative"
                  >
                    <label className="block text-xs font-medium text-[#434F63] mb-1">
                      Thuộc công việc nào?{' '}
                      <span className="text-chu-sa" aria-hidden="true">
                        *
                      </span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setParentPickerOpen((v) => !v)}
                      aria-expanded={parentPickerOpen}
                      aria-invalid={Boolean(parentError)}
                      aria-describedby={
                        parentError ? 'new-task-parent-error' : undefined
                      }
                      className={`w-full h-[36px] px-3 bg-white border rounded-xl text-[13.5px] flex items-center justify-between gap-2 text-left transition-colors focus:outline-none focus:ring-2 ${
                        parentError
                          ? 'border-chu-sa focus:ring-chu-sa/25'
                          : 'border-[#DFD8CA] hover:border-[#C7BFAE] focus:ring-lam-sang/25 focus:border-lam-sang'
                      }`}
                    >
                      {selectedParent ? (
                        <span className="min-w-0 flex items-center gap-2 truncate">
                          <span className="font-mono-tabular text-xs font-bold text-huyen-lam bg-[#F3EFE6] px-1.5 py-0.5 rounded shrink-0">
                            {selectedParent.displayCode}
                          </span>
                          <span className="truncate text-huyen-lam font-medium">
                            {selectedParent.title}
                          </span>
                        </span>
                      ) : (
                        <span className="text-[#8E96A3] truncate">
                          Chọn công việc chính...
                        </span>
                      )}
                      <ChevronDown
                        className={`w-4 h-4 text-[#7D8796] shrink-0 transition-transform duration-150 ${
                          parentPickerOpen ? 'rotate-180' : ''
                        }`}
                      />
                    </button>

                    {parentError && (
                      <p
                        id="new-task-parent-error"
                        className="mt-1 text-[11.5px] font-medium text-chu-sa"
                      >
                        {parentError}
                      </p>
                    )}

                    {parentPickerOpen && (
                      <div className="absolute left-0 right-0 top-full mt-1 z-30 bg-trang-nga border border-[#DFD8CA] rounded-xl shadow-[0_14px_30px_-8px_rgba(20,36,63,0.18)] overflow-hidden">
                        <div className="p-2 border-b border-[#EFEAE0] bg-[#FAF8F3]">
                          <div className="relative">
                            <Search className="w-3.5 h-3.5 text-[#8A94A3] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                            <input
                              ref={parentSearchRef}
                              type="text"
                              value={parentSearch}
                              onChange={(e) => setParentSearch(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  const firstMatch = filteredParents[0];
                                  if (firstMatch) {
                                    setParentId(firstMatch.id);
                                    setParentError(null);
                                    setParentPickerOpen(false);
                                    setParentSearch('');
                                  }
                                }
                              }}
                              placeholder="Tìm theo mã hoặc tên việc chính..."
                              aria-label="Tìm công việc chính"
                              className="w-full h-[32px] pl-8 pr-7 text-xs bg-white border border-[#E2DCD0] rounded-lg text-huyen-lam placeholder:text-[#969EAE] focus:outline-none focus:ring-2 focus:ring-lam-sang/25 focus:border-lam-sang"
                            />
                            {parentSearch && (
                              <button
                                type="button"
                                onClick={() => setParentSearch('')}
                                aria-label="Xóa từ khóa tìm việc chính"
                                className="absolute right-1 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center text-[#7D8796] hover:text-huyen-lam"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="max-h-44 overflow-y-auto divide-y divide-[#F3EFE6]">
                          {filteredParents.length === 0 ? (
                            <div className="px-3 py-4 text-xs text-center text-[#7E8796]">
                              Không tìm thấy công việc chính phù hợp.
                            </div>
                          ) : (
                            filteredParents.map((p) => {
                              const isPicked = p.id === parentId;
                              const pCat = getEffectiveCategory(
                                p,
                                tasks,
                                categories
                              );
                              const dotColor = getCategoryDotColor(
                                pCat.categoryId,
                                pCat.category
                              );
                              return (
                                <button
                                  key={p.id}
                                  type="button"
                                  onClick={() => {
                                    setParentId(p.id);
                                    setParentError(null);
                                    setParentPickerOpen(false);
                                    setParentSearch('');
                                  }}
                                  className={`w-full px-3 py-2 text-left flex items-center gap-2 text-xs transition-colors ${
                                    isPicked
                                      ? 'bg-lam-sang-soft/80 text-huyen-lam font-semibold'
                                      : 'hover:bg-[#FAF8F3] text-huyen-lam'
                                  }`}
                                >
                                  <span
                                    className="w-1.5 h-1.5 rounded-[2px] shrink-0"
                                    style={{ backgroundColor: dotColor }}
                                    aria-hidden="true"
                                  />
                                  <span className="font-mono-tabular font-bold text-huyen-lam shrink-0 min-w-[20px]">
                                    {p.displayCode}
                                  </span>
                                  <span className="flex-1 min-w-0 truncate">
                                    {p.title}
                                  </span>
                                  {isPicked && (
                                    <Check className="w-3.5 h-3.5 text-lam-sang-ink shrink-0" />
                                  )}
                                </button>
                              );
                            })
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Prominent Task Title + Compact Display Code */}
                <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_104px] gap-2.5 items-start">
                  <div className="min-w-0">
                    <label
                      htmlFor="new-task-title"
                      className="block text-xs font-medium text-[#434F63] mb-1"
                    >
                      Tên công việc{' '}
                      <span className="text-chu-sa" aria-hidden="true">
                        *
                      </span>
                    </label>
                    <input
                      id="new-task-title"
                      ref={titleInputRef}
                      type="text"
                      required
                      maxLength={300}
                      value={title}
                      onChange={(e) => {
                        setTitle(e.target.value);
                        if (titleError && e.target.value.trim()) {
                          setTitleError(null);
                        }
                      }}
                      aria-invalid={Boolean(titleError)}
                      aria-describedby={
                        titleError ? 'new-task-title-error' : undefined
                      }
                      placeholder="Nhập tên công việc..."
                      className={`${fieldBase} h-[40px] text-[14px] font-medium ${
                        titleError
                          ? 'border-chu-sa focus:ring-chu-sa/25'
                          : 'border-[#D7CFC0] focus:ring-lam-sang/25 focus:border-lam-sang'
                      }`}
                    />
                    {titleError && (
                      <p
                        id="new-task-title-error"
                        className="mt-1 text-[11.5px] font-medium text-chu-sa"
                      >
                        {titleError}
                      </p>
                    )}
                  </div>

                  <div className="min-w-0">
                    <label
                      htmlFor="new-task-code"
                      className="block text-xs font-medium text-[#434F63] mb-1"
                    >
                      Mã hiển thị
                    </label>
                    <input
                      id="new-task-code"
                      type="text"
                      maxLength={24}
                      value={displayCode}
                      onChange={(e) => setDisplayCode(e.target.value)}
                      placeholder={suggestedCode}
                      className={`${fieldBase} h-[40px] font-mono-tabular border-[#DFD8CA] focus:ring-lam-sang/25 focus:border-lam-sang`}
                    />
                  </div>
                </div>

                {/* Category + Initial Status */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="min-w-0">
                    <label
                      htmlFor="new-task-category"
                      className="block text-xs font-medium text-[#434F63] mb-1"
                    >
                      Hạng mục
                    </label>
                    {taskMode === 'subtask' && !isManager ? (
                      <div className="px-3 h-[36px] text-[13.5px] bg-[#FAF8F3] border border-[#E6E0D3] rounded-xl text-huyen-lam flex items-center truncate">
                        {parentCatMeta?.category || 'Chưa phân hạng mục'}
                      </div>
                    ) : (
                      <select
                        id="new-task-category"
                        value={categoryId}
                        onChange={(e) => setCategoryId(e.target.value)}
                        className={normalFieldClass}
                      >
                        <option value="">
                          {taskMode === 'subtask' && parentCatMeta?.category
                            ? `Theo việc chính (${parentCatMeta.category})`
                            : 'Chưa phân hạng mục'}
                        </option>
                        {activeCategories.map((cat) => (
                          <option key={cat.id} value={cat.id}>
                            {cat.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  <div className="min-w-0">
                    <label
                      htmlFor="new-task-status"
                      className="block text-xs font-medium text-[#434F63] mb-1"
                    >
                      Trạng thái
                    </label>
                    <select
                      id="new-task-status"
                      value={status}
                      onChange={(e) => setStatus(e.target.value as TaskStatus)}
                      className={normalFieldClass}
                    >
                      {ALL_STATUSES.filter((s) => s !== 'Hoàn thành').map((st) => (
                        <option key={st} value={st}>
                          {st}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </section>

              {/* Nhóm 2 — Phân công */}
              <section
                className="pt-3 border-t border-[#ECE6DA] space-y-2"
                aria-label="Phân công"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11.5px] font-semibold text-[#5B6678] tracking-[0.01em]">
                    Phân công
                  </span>
                  {isManager && (
                    <span
                      className={`text-[11.5px] font-medium tabular-nums ${
                        assigneeUids.length > 0
                          ? 'text-thanh-ngoc-ink'
                          : 'text-[#8A94A3]'
                      }`}
                    >
                      {assigneeUids.length > 0
                        ? `Đã chọn ${assigneeUids.length}`
                        : 'Chưa giao'}
                    </span>
                  )}
                </div>

                {isManager ? (
                  <div className="space-y-2">
                    <div>
                      <div className="text-xs font-medium text-[#434F63] mb-1.5">
                        Người được giao
                      </div>

                      {assignableMembers.length === 0 ? (
                        <p className="text-xs text-[#7E8796]">
                          Chưa có thành viên hoạt động nào đủ điều kiện giao việc.
                        </p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {assignableMembers.map((m) => {
                            const selected = assigneeUids.includes(m.uid);
                            const compactLabel = getCompactMemberLabel(m);
                            const hasDup = duplicateLabels.has(
                              compactLabel.toLowerCase()
                            );
                            const isTemp = isTemporaryAccountEmail(m.email);
                            const emailPrefix = m.email.split('@')[0];
                            const tooltipText = [
                              compactLabel,
                              m.sheetAlias && m.sheetAlias !== compactLabel
                                ? `Tên gốc: ${m.sheetAlias}`
                                : '',
                              m.email,
                              isTemp ? 'Tài khoản tạm' : '',
                            ]
                              .filter(Boolean)
                              .join(' · ');

                            return (
                              <button
                                key={m.uid}
                                type="button"
                                onClick={() => toggleUid(m.uid)}
                                aria-pressed={selected}
                                title={tooltipText}
                                className={`inline-flex items-center gap-1.5 h-[33px] px-2.5 rounded-lg border text-xs font-medium transition-colors whitespace-nowrap ${
                                  selected
                                    ? 'bg-huyen-lam border-huyen-lam text-trang-nga font-semibold shadow-[0_1px_2px_rgba(20,36,63,0.12)]'
                                    : 'bg-white border-[#DFD8CA] text-huyen-lam hover:bg-[#FAF8F3] hover:border-[#CBC2B0]'
                                }`}
                              >
                                <span
                                  className={`w-3.5 h-3.5 rounded flex items-center justify-center shrink-0 transition-colors ${
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
                                      selected
                                        ? 'text-slate-200'
                                        : 'text-[#7E8796]'
                                    }`}
                                  >
                                    ({emailPrefix})
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Discreet Optional Display-Only Label */}
                    {!showExtraAlias && !customAssigneeNote ? (
                      <button
                        type="button"
                        onClick={() => setShowExtraAlias(true)}
                        className="inline-flex items-center gap-1 text-[11.5px] font-medium text-[#5E697A] hover:text-huyen-lam transition-colors py-0.5"
                      >
                        <Plus className="w-3 h-3 shrink-0 text-minh-kim-ink" />
                        <span>Tên hiển thị thêm (không cấp quyền sửa)</span>
                      </button>
                    ) : (
                      <div className="pt-1">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <label
                            htmlFor="new-task-extra-alias"
                            className="text-[11.5px] font-medium text-[#5B6678]"
                          >
                            Tên hiển thị thêm{' '}
                            <span className="font-normal text-[#838C9A]">
                              (chỉ để hiển thị, không cấp quyền sửa)
                            </span>
                          </label>
                          {!customAssigneeNote && (
                            <button
                              type="button"
                              onClick={() => setShowExtraAlias(false)}
                              className="text-[11px] text-[#7E8796] hover:text-huyen-lam"
                            >
                              Thu gọn
                            </button>
                          )}
                        </div>
                        <input
                          id="new-task-extra-alias"
                          type="text"
                          value={customAssigneeNote}
                          onChange={(e) =>
                            setCustomAssigneeNote(e.target.value)
                          }
                          placeholder="Ví dụ: Nhóm"
                          className={`${fieldBase} h-[34px] text-xs border-[#DFD8CA] focus:ring-lam-sang/25 focus:border-lam-sang`}
                        />
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="px-3 py-2 bg-[#FAF8F3] border border-[#E6E0D3] rounded-xl text-xs text-[#5B6678]">
                    <span>Người được giao: </span>
                    <strong className="font-semibold text-huyen-lam">
                      {getCompactMemberLabel(currentUser)}
                    </strong>
                    <span className="text-[#7E8796]">
                      {' '}
                      · Có quyền cập nhật việc con này.
                    </span>
                  </div>
                )}
              </section>

              {/* Nhóm 3 — Theo dõi */}
              <section
                className="pt-3 border-t border-[#ECE6DA] space-y-2"
                aria-label="Theo dõi"
              >
                <span className="block text-[11.5px] font-semibold text-[#5B6678] tracking-[0.01em]">
                  Theo dõi
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_154px] gap-2.5">
                  <div className="min-w-0">
                    <label
                      htmlFor="new-task-next-step"
                      className="block text-xs font-medium text-[#434F63] mb-1"
                    >
                      Bước tiếp theo
                    </label>
                    <input
                      id="new-task-next-step"
                      type="text"
                      maxLength={500}
                      value={nextStep}
                      onChange={(e) => setNextStep(e.target.value)}
                      placeholder="Ví dụ: Soạn bản nháp, chờ duyệt..."
                      className={normalFieldClass}
                    />
                  </div>

                  <div className="min-w-0">
                    <label
                      htmlFor="new-task-due-date"
                      className="block text-xs font-medium text-[#434F63] mb-1"
                    >
                      Hạn xử lý
                    </label>
                    <input
                      id="new-task-due-date"
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      className={`${normalFieldClass} font-mono-tabular`}
                    />
                  </div>
                </div>
              </section>

              {submitError && (
                <div
                  role="alert"
                  className="px-3 py-2 text-xs font-medium text-chu-sa bg-chu-sa-soft border border-chu-sa-border rounded-xl flex items-start gap-2"
                >
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{submitError}</span>
                </div>
              )}
            </div>

            {/* Sticky Minimal Footer */}
            <div className="shrink-0 px-5 py-2.5 pb-[max(0.65rem,env(safe-area-inset-bottom))] bg-[#FAF8F3]/95 border-t border-[#EAE3D5]">
              {confirmDiscard ? (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-medium text-chu-sa">
                    Nội dung chưa được lưu. Bạn muốn đóng chứ?
                  </span>
                  <div className="flex items-center gap-2 ml-auto">
                    <button
                      type="button"
                      onClick={() => setConfirmDiscard(false)}
                      className="px-3 h-[34px] text-xs font-medium text-huyen-lam hover:bg-[#EFEAE0] rounded-lg transition-colors"
                    >
                      Tiếp tục sửa
                    </button>
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-3 h-[34px] text-xs font-semibold bg-chu-sa text-white hover:opacity-90 rounded-lg transition-opacity"
                    >
                      Bỏ thay đổi
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={requestClose}
                    disabled={submitting}
                    className="px-4 h-[36px] text-[13.5px] font-medium text-[#5E697A] hover:text-huyen-lam hover:bg-[#EFEAE0] rounded-xl transition-colors disabled:opacity-50"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    aria-busy={submitting}
                    className="px-4 h-[36px] text-[13.5px] font-semibold bg-huyen-lam text-trang-nga rounded-xl hover:bg-lam-tri-tue shadow-[0_1px_2px_rgba(20,36,63,0.16)] transition-colors disabled:opacity-60"
                  >
                    {submitting ? 'Đang lưu...' : 'Tạo công việc'}
                  </button>
                </div>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
