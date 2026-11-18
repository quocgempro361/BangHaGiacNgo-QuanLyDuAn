import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Copy,
  ExternalLink,
  FileCheck2,
  Library,
  Link2Off,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import {
  CategoryItem,
  DocumentLink,
  ProjectMember,
  TaskItem,
} from '../types/project';
import {
  buildProjectDocumentEntries,
  buildTaskLinkAddPatch,
  buildTaskLinkRemovePatch,
  buildTaskLinkUpdatePatch,
  canUserEditTask,
  DocumentLinkGroup,
  isB1TestTask,
  isGenericDocumentLabel,
  MAX_LINKS_PER_GROUP,
  normalizeLinkUrlForComparison,
  ProjectDocumentEntry,
  validateHttpUrl,
} from '../utils/taskHelpers';

interface DocumentsViewProps {
  tasks: TaskItem[];
  categories: CategoryItem[];
  members?: ProjectMember[];
  currentUser: ProjectMember;
  onSelectTask: (taskId: string) => void;
  onNavigateToTasks: () => void;
  onSaveTask: (
    taskId: string,
    patch: Partial<TaskItem>,
    expectedVersion: number
  ) => Promise<{ ok: boolean; error?: string }>;
}

type EditorModalState =
  | {
      mode: 'add';
      taskId: string;
      group: DocumentLinkGroup;
      label: string;
      url: string;
    }
  | {
      mode: 'edit';
      taskId: string;
      linkId: string;
      fromGroup: DocumentLinkGroup;
      toGroup: DocumentLinkGroup;
      label: string;
      url: string;
      openedVersion: number;
      hadPlaceholderLabel: boolean;
    };

export const DocumentsView: React.FC<DocumentsViewProps> = ({
  tasks,
  categories,
  members = [],
  currentUser,
  onSelectTask,
  onNavigateToTasks,
  onSaveTask,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [groupFilter, setGroupFilter] = useState<'all' | DocumentLinkGroup>(
    'all'
  );
  const [taskFilter, setTaskFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [reviewOnly, setReviewOnly] = useState(false);
  const [duplicateOnly, setDuplicateOnly] = useState(false);

  const [editorModal, setEditorModal] = useState<EditorModalState | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [editorSaving, setEditorSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<{
    entry: ProjectDocumentEntry;
    openedVersion: number;
  } | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const activeTasks = useMemo(
    () =>
      tasks
        .filter((t) => !t.archivedAt && !isB1TestTask(t))
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [tasks]
  );

  const editableTasks = useMemo(
    () => activeTasks.filter((t) => canUserEditTask(currentUser, t)),
    [activeTasks, currentUser]
  );

  const sortedCategories = useMemo(
    () => [...categories].sort((a, b) => a.sortOrder - b.sortOrder),
    [categories]
  );

  const summary = useMemo(
    () => buildProjectDocumentEntries(tasks, categories, members),
    [tasks, categories, members]
  );

  const hasActiveFilter =
    searchQuery.trim() !== '' ||
    groupFilter !== 'all' ||
    taskFilter !== 'all' ||
    categoryFilter !== 'all' ||
    reviewOnly ||
    duplicateOnly;

  const resetFilters = () => {
    setSearchQuery('');
    setGroupFilter('all');
    setTaskFilter('all');
    setCategoryFilter('all');
    setReviewOnly(false);
    setDuplicateOnly(false);
  };

  const filteredEntries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return summary.entries.filter((entry) => {
      if (groupFilter !== 'all' && entry.group !== groupFilter) {
        return false;
      }
      if (taskFilter !== 'all' && entry.taskId !== taskFilter) {
        return false;
      }
      if (categoryFilter !== 'all') {
        if (categoryFilter === '__uncategorized__') {
          if (entry.categoryId) return false;
        } else if (entry.categoryId !== categoryFilter) {
          return false;
        }
      }
      if (reviewOnly && !entry.needsReview) {
        return false;
      }
      if (duplicateOnly && entry.duplicateOccurrences.length === 0) {
        return false;
      }
      if (q) {
        const hay = [
          entry.displayLabel,
          entry.sourceLabel,
          entry.taskCode,
          entry.taskTitle,
          entry.categoryName,
          entry.assigneeNamesText,
          entry.assigneeSearchText,
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [
    summary.entries,
    searchQuery,
    groupFilter,
    taskFilter,
    categoryFilter,
    reviewOnly,
    duplicateOnly,
  ]);

  // Escape key handling for modals
  useEffect(() => {
    if (!editorModal && !deleteTarget) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (editorSaving || deleting) return;
      if (deleteTarget) {
        setDeleteTarget(null);
        setDeleteError(null);
      } else if (editorModal) {
        setEditorModal(null);
        setEditorError(null);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [editorModal, deleteTarget, editorSaving, deleting]);

  const openAddModal = () => {
    if (editableTasks.length === 0) return;
    const defaultTaskId =
      taskFilter !== 'all' &&
      editableTasks.some((t) => t.id === taskFilter)
        ? taskFilter
        : editableTasks[0].id;
    const defaultGroup: DocumentLinkGroup =
      groupFilter === 'reference' || groupFilter === 'result'
        ? groupFilter
        : 'reference';

    setEditorError(null);
    setEditorModal({
      mode: 'add',
      taskId: defaultTaskId,
      group: defaultGroup,
      label: '',
      url: '',
    });
  };

  const openEditModal = (entry: ProjectDocumentEntry) => {
    if (!canUserEditTask(currentUser, entry.task)) return;
    const isPlaceholder = isGenericDocumentLabel(entry.link.label);
    setEditorError(null);
    setEditorModal({
      mode: 'edit',
      taskId: entry.taskId,
      linkId: entry.linkId,
      fromGroup: entry.group,
      toGroup: entry.group,
      label: isPlaceholder ? '' : entry.link.label,
      url: entry.link.url ?? '',
      openedVersion: entry.task.version,
      hadPlaceholderLabel: isPlaceholder,
    });
  };

  const handleReloadLatestForEdit = () => {
    if (!editorModal || editorModal.mode !== 'edit') return;
    const liveTask = activeTasks.find((t) => t.id === editorModal.taskId);
    if (!liveTask) {
      setEditorError('Công việc gốc không còn tồn tại hoặc đã bị lưu trữ.');
      return;
    }
    const inRef = liveTask.referenceLinks.find(
      (l) => l.id === editorModal.linkId
    );
    const inRes = liveTask.resultLinks.find((l) => l.id === editorModal.linkId);
    const found = inRef ?? inRes;
    const foundGroup: DocumentLinkGroup | null = inRef
      ? 'reference'
      : inRes
      ? 'result'
      : null;

    if (!found || !foundGroup) {
      setEditorError('Liên kết này đã bị xóa khỏi công việc gốc.');
      return;
    }

    const isPlaceholder = isGenericDocumentLabel(found.label);
    setEditorError(null);
    setEditorModal({
      mode: 'edit',
      taskId: liveTask.id,
      linkId: found.id,
      fromGroup: foundGroup,
      toGroup: foundGroup,
      label: isPlaceholder ? '' : found.label,
      url: found.url ?? '',
      openedVersion: liveTask.version,
      hadPlaceholderLabel: isPlaceholder,
    });
  };

  const handleSubmitEditor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editorModal || editorSaving) return;

    const cleanLabel = editorModal.label.trim();
    if (!cleanLabel) {
      setEditorError('Vui lòng nhập tên tài liệu rõ ràng.');
      return;
    }
    if (isGenericDocumentLabel(cleanLabel)) {
      setEditorError(
        'Vui lòng đặt tên cụ thể hơn (tránh dùng tên chung chung như "Tài liệu" hoặc "Link").'
      );
      return;
    }

    const urlCheck = validateHttpUrl(editorModal.url);
    if (!urlCheck.ok) {
      setEditorError(urlCheck.error);
      return;
    }

    const liveTask = activeTasks.find((t) => t.id === editorModal.taskId);
    if (!liveTask) {
      setEditorError('Không tìm thấy công việc gốc. Có thể công việc đã bị lưu trữ.');
      return;
    }
    if (!canUserEditTask(currentUser, liveTask)) {
      setEditorError('Bạn không có quyền chỉnh sửa liên kết trên công việc này.');
      return;
    }

    if (editorModal.mode === 'add') {
      const newLink: DocumentLink = {
        id: `lnk_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        label: cleanLabel,
        url: urlCheck.normalizedUrl,
        type: editorModal.group === 'reference' ? 'reference' : 'result',
        needsUrlExtraction: false,
      };
      const patchRes = buildTaskLinkAddPatch(
        liveTask,
        editorModal.group,
        newLink
      );
      if (!patchRes.ok) {
        setEditorError(patchRes.error);
        return;
      }

      setEditorError(null);
      setEditorSaving(true);
      try {
        const res = await onSaveTask(
          liveTask.id,
          patchRes.patch,
          liveTask.version
        );
        if (res.ok) {
          setEditorModal(null);
        } else {
          setEditorError(
            res.error ||
              'Không thể lưu liên kết mới. Dữ liệu bạn nhập vẫn được giữ nguyên.'
          );
        }
      } finally {
        setEditorSaving(false);
      }
      return;
    }

    // Mode: edit
    if (liveTask.version !== editorModal.openedVersion) {
      setEditorError(
        `Công việc ${liveTask.displayCode} vừa được cập nhật lên v${liveTask.version} (bạn đang mở v${editorModal.openedVersion}). Hãy bấm "Tải bản mới nhất" để tránh ghi đè.`
      );
      return;
    }

    const patchRes = buildTaskLinkUpdatePatch(
      liveTask,
      editorModal.fromGroup,
      editorModal.linkId,
      {
        label: cleanLabel,
        url: urlCheck.normalizedUrl,
        toGroup: editorModal.toGroup,
      }
    );
    if (!patchRes.ok) {
      setEditorError(patchRes.error);
      return;
    }

    setEditorError(null);
    setEditorSaving(true);
    try {
      const res = await onSaveTask(
        liveTask.id,
        patchRes.patch,
        editorModal.openedVersion
      );
      if (res.ok) {
        setEditorModal(null);
      } else {
        setEditorError(
          res.error ||
            'Không thể lưu thay đổi. Bản nháp của bạn vẫn được giữ nguyên.'
        );
      }
    } finally {
      setEditorSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget || deleting) return;
    const { entry, openedVersion } = deleteTarget;
    const liveTask = activeTasks.find((t) => t.id === entry.taskId);

    if (!liveTask) {
      setDeleteError('Công việc gốc không còn tồn tại hoặc đã bị lưu trữ.');
      return;
    }
    if (!canUserEditTask(currentUser, liveTask)) {
      setDeleteError('Bạn không có quyền xóa liên kết trên công việc này.');
      return;
    }
    if (liveTask.version !== openedVersion) {
      setDeleteError(
        `Công việc ${liveTask.displayCode} vừa được cập nhật lên v${liveTask.version}. Vui lòng đóng và mở lại thao tác xóa để đảm bảo đồng bộ.`
      );
      return;
    }

    const patchRes = buildTaskLinkRemovePatch(
      liveTask,
      entry.group,
      entry.linkId
    );
    if (!patchRes.ok) {
      setDeleteError(patchRes.error);
      return;
    }

    setDeleteError(null);
    setDeleting(true);
    try {
      const res = await onSaveTask(liveTask.id, patchRes.patch, openedVersion);
      if (res.ok) {
        setDeleteTarget(null);
      } else {
        setDeleteError(
          res.error || 'Không thể xóa liên kết khỏi hệ thống.'
        );
      }
    } finally {
      setDeleting(false);
    }
  };

  // Live duplicate URL warning inside editor modal (non-blocking)
  const editorUrlDuplicateWarning = useMemo(() => {
    if (!editorModal) return null;
    const urlRes = validateHttpUrl(editorModal.url);
    if (!urlRes.ok) return null;
    const norm = normalizeLinkUrlForComparison(urlRes.normalizedUrl);
    if (!norm) return null;

    const currentKey =
      editorModal.mode === 'edit'
        ? `${editorModal.taskId}:${editorModal.fromGroup}:${editorModal.linkId}`
        : '';

    const matches = summary.entries.filter(
      (e) => e.normalizedUrl === norm && e.key !== currentKey
    );
    if (matches.length === 0) return null;

    const sameTask = matches.some((m) => m.taskId === editorModal.taskId);
    const otherTaskCodes = Array.from(
      new Set(
        matches
          .filter((m) => m.taskId !== editorModal.taskId)
          .map((m) => m.taskCode)
      )
    );

    if (sameTask && otherTaskCodes.length > 0) {
      return `URL này đã có trong công việc này và công việc ${otherTaskCodes.join(', ')}.`;
    }
    if (sameTask) {
      return 'URL này đã tồn tại trong công việc đang chọn.';
    }
    return `URL này hiện cũng được gắn ở công việc ${otherTaskCodes.join(', ')}.`;
  }, [editorModal, summary.entries]);

  const editorSelectedTaskLiveVersionMismatch = useMemo(() => {
    if (!editorModal || editorModal.mode !== 'edit') return false;
    const liveTask = activeTasks.find((t) => t.id === editorModal.taskId);
    return Boolean(liveTask && liveTask.version !== editorModal.openedVersion);
  }, [editorModal, activeTasks]);

  const modalSelectedTask = editorModal
    ? activeTasks.find((t) => t.id === editorModal.taskId) ?? null
    : null;
  const modalTargetGroup = editorModal
    ? editorModal.mode === 'add'
      ? editorModal.group
      : editorModal.toGroup
    : 'reference';
  const modalTargetGroupCount = modalSelectedTask
    ? modalTargetGroup === 'reference'
      ? modalSelectedTask.referenceLinks.length
      : modalSelectedTask.resultLinks.length
    : 0;
  const modalGroupCapReached =
    Boolean(editorModal) &&
    (editorModal?.mode === 'add' ||
      (editorModal?.mode === 'edit' &&
        editorModal.fromGroup !== editorModal.toGroup)) &&
    modalTargetGroupCount >= MAX_LINKS_PER_GROUP;

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <h1 className="text-[22px] sm:text-[26px] font-bold text-huyen-lam tracking-[-0.02em] leading-tight">
              Tài liệu dự án
            </h1>
            <span
              className="hidden sm:inline-block h-[2px] w-6 bg-minh-kim/80 rounded-full"
              aria-hidden="true"
            />
          </div>
          <p className="text-xs sm:text-[13.5px] text-[#5E697A] mt-1">
            Tổng hợp tài liệu cần đọc / tham khảo và kết quả nghiên cứu từ các
            công việc trong dự án
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <button
            type="button"
            onClick={onNavigateToTasks}
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl border border-[#DDD6C7] bg-trang-nga text-huyen-lam text-xs sm:text-[13px] font-medium hover:bg-[#F4F0E6] hover:border-[#CCC3B0] transition-colors whitespace-nowrap min-h-[42px]"
          >
            <span>Danh sách công việc</span>
            <ArrowRight className="w-3.5 h-3.5 shrink-0 text-[#667285]" />
          </button>

          {editableTasks.length > 0 && (
            <button
              type="button"
              onClick={openAddModal}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-huyen-lam text-trang-nga text-sm font-semibold hover:bg-lam-tri-tue shadow-[0_1px_2px_rgba(20,36,63,0.14)] transition-colors whitespace-nowrap shrink-0 min-h-[42px]"
            >
              <Plus className="w-4 h-4 shrink-0 text-kim-quang" />
              <span>Thêm liên kết</span>
            </button>
          )}
        </div>
      </div>

      {/* A. Compact Summary Strip (Single Elevation, Hairline Divided) */}
      <section
        aria-label="Thống kê tài liệu dự án"
        className="bg-trang-nga border border-[#E5DFD2] rounded-2xl grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-[#ECE6DA] shadow-[0_1px_3px_rgba(20,36,63,0.03)]"
      >
        <button
          type="button"
          onClick={() => {
            setGroupFilter('all');
            setReviewOnly(false);
            setDuplicateOnly(false);
          }}
          className={`p-3.5 sm:p-4 text-left transition-colors first:rounded-tl-2xl lg:first:rounded-l-2xl hover:bg-[#FAF8F3] ${
            groupFilter === 'all' && !reviewOnly && !duplicateOnly
              ? 'bg-[#FAF8F3]/75'
              : ''
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-[#5E697A]">
              Tổng số liên kết
            </span>
            <Library className="w-4 h-4 text-huyen-lam/75 shrink-0" />
          </div>
          <div className="mt-1.5 flex items-baseline gap-2 flex-wrap">
            <span className="text-xl sm:text-2xl font-bold font-mono-tabular text-huyen-lam">
              {summary.totalLinks}
            </span>
            {summary.validUrlLinkCount > 0 && (
              <span className="text-[11.5px] text-[#6E7889] tabular-nums">
                {summary.uniqueValidUrlCount} URL duy nhất
              </span>
            )}
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            setGroupFilter((prev) =>
              prev === 'reference' ? 'all' : 'reference'
            );
          }}
          aria-pressed={groupFilter === 'reference'}
          className={`p-3.5 sm:p-4 text-left transition-colors rounded-tr-2xl lg:rounded-none hover:bg-lam-sang-soft/45 border-l border-[#ECE6DA] lg:border-l-0 ${
            groupFilter === 'reference' ? 'bg-lam-sang-soft/75' : ''
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-lam-sang-ink">
              Tài liệu tham khảo
            </span>
            <BookOpen className="w-4 h-4 text-lam-sang-ink shrink-0" />
          </div>
          <div className="mt-1.5 flex items-baseline gap-2 flex-wrap">
            <span className="text-xl sm:text-2xl font-bold font-mono-tabular text-huyen-lam">
              {summary.referenceCount}
            </span>
            <span className="text-[11.5px] text-[#6E7889]">
              Đầu vào nghiên cứu
            </span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            setGroupFilter((prev) => (prev === 'result' ? 'all' : 'result'));
          }}
          aria-pressed={groupFilter === 'result'}
          className={`p-3.5 sm:p-4 text-left transition-colors rounded-bl-2xl lg:rounded-none hover:bg-thanh-ngoc-soft/45 ${
            groupFilter === 'result' ? 'bg-thanh-ngoc-soft/75' : ''
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-thanh-ngoc-ink">
              Kết quả nghiên cứu
            </span>
            <FileCheck2 className="w-4 h-4 text-thanh-ngoc-ink shrink-0" />
          </div>
          <div className="mt-1.5 flex items-baseline gap-2 flex-wrap">
            <span className="text-xl sm:text-2xl font-bold font-mono-tabular text-huyen-lam">
              {summary.resultCount}
            </span>
            <span className="text-[11.5px] text-[#6E7889]">
              Bản thảo &amp; sản phẩm
            </span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setReviewOnly((v) => !v)}
          aria-pressed={reviewOnly}
          className={`p-3.5 sm:p-4 text-left transition-colors rounded-br-2xl lg:rounded-r-2xl border-l border-[#ECE6DA] lg:border-l-0 hover:bg-minh-kim-soft/45 ${
            reviewOnly ? 'bg-minh-kim-soft/80' : ''
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span
              className={`text-xs font-medium ${
                summary.reviewNeededCount > 0
                  ? 'text-minh-kim-ink'
                  : 'text-[#5E697A]'
              }`}
            >
              Cần rà soát
            </span>
            <AlertTriangle
              className={`w-4 h-4 shrink-0 ${
                summary.reviewNeededCount > 0
                  ? 'text-minh-kim-ink'
                  : 'text-[#8A94A3]'
              }`}
            />
          </div>
          <div className="mt-1.5 flex items-baseline gap-2 flex-wrap">
            <span className="text-xl sm:text-2xl font-bold font-mono-tabular text-huyen-lam">
              {summary.reviewNeededCount}
            </span>
            <span className="text-[11.5px] text-[#6E7889]">
              {summary.reviewNeededCount > 0
                ? 'Thiếu tên hoặc URL lỗi'
                : 'Đều đã rõ ràng'}
            </span>
          </div>
        </button>
      </section>

      {/* B & C. Search & Filter Bar */}
      <div className="bg-trang-nga border border-[#E5DFD2] rounded-2xl p-3 sm:p-4 space-y-3 shadow-[0_1px_3px_rgba(20,36,63,0.03)]">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
          <div className="relative flex-1 min-w-0">
            <Search className="w-4 h-4 text-[#8A94A3] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm theo tên tài liệu, mã/tên công việc, người phụ trách, hạng mục..."
              aria-label="Tìm kiếm tài liệu dự án"
              className="w-full pl-10 pr-10 py-2 text-sm bg-[#FAF8F3] border border-[#E2DCD0] rounded-xl text-huyen-lam placeholder:text-[#8E96A3] focus:outline-none focus:ring-2 focus:ring-lam-sang/30 focus:border-lam-sang focus:bg-white min-h-[42px] transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Xóa từ khóa tìm kiếm"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center rounded-lg text-[#7D8796] hover:text-huyen-lam hover:bg-[#EFEAE0] transition-colors"
              >
                <X className="w-4 h-4 shrink-0" />
              </button>
            )}
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-2.5 shrink-0">
            <div className="text-xs sm:text-[13px] text-[#606B7D] tabular-nums whitespace-nowrap px-1">
              Đang xem{' '}
              <span
                className={`font-mono-tabular font-semibold ${
                  hasActiveFilter ? 'text-lam-sang-ink' : 'text-huyen-lam'
                }`}
              >
                {filteredEntries.length}/{summary.totalLinks}
              </span>{' '}
              liên kết
            </div>

            {hasActiveFilter && (
              <button
                type="button"
                onClick={resetFilters}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-chu-sa-soft border border-chu-sa-border text-chu-sa hover:bg-chu-sa hover:text-white transition-colors whitespace-nowrap min-h-[40px]"
              >
                <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                <span>Xóa lọc</span>
              </button>
            )}
          </div>
        </div>

        {/* Filter Controls */}
        <div className="flex flex-col lg:flex-row lg:items-center gap-2.5">
          {/* Segmented Group Filter */}
          <div
            role="group"
            aria-label="Lọc theo loại tài liệu"
            className="inline-flex items-center p-1 bg-[#F4F0E6] border border-[#E5DFD2] rounded-xl shrink-0 overflow-x-auto"
          >
            <button
              type="button"
              onClick={() => setGroupFilter('all')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap min-h-[34px] ${
                groupFilter === 'all'
                  ? 'bg-white text-huyen-lam font-semibold shadow-xs'
                  : 'text-[#5E697A] hover:text-huyen-lam'
              }`}
            >
              Tất cả
            </button>
            <button
              type="button"
              onClick={() => setGroupFilter('reference')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap min-h-[34px] inline-flex items-center gap-1.5 ${
                groupFilter === 'reference'
                  ? 'bg-white text-lam-sang-ink font-semibold shadow-xs'
                  : 'text-[#5E697A] hover:text-huyen-lam'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5 shrink-0" />
              <span>Tài liệu tham khảo</span>
            </button>
            <button
              type="button"
              onClick={() => setGroupFilter('result')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap min-h-[34px] inline-flex items-center gap-1.5 ${
                groupFilter === 'result'
                  ? 'bg-white text-thanh-ngoc-ink font-semibold shadow-xs'
                  : 'text-[#5E697A] hover:text-huyen-lam'
              }`}
            >
              <FileCheck2 className="w-3.5 h-3.5 shrink-0" />
              <span>Kết quả nghiên cứu</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 flex-1 min-w-0">
            <select
              aria-label="Lọc theo công việc"
              value={taskFilter}
              onChange={(e) => setTaskFilter(e.target.value)}
              className={`w-full px-3 py-2 text-[13px] rounded-xl border focus:outline-none focus:ring-2 focus:ring-lam-sang/30 min-h-[42px] transition-colors ${
                taskFilter !== 'all'
                  ? 'bg-lam-sang-soft border-lam-sang/40 text-huyen-lam font-medium'
                  : 'bg-white border-[#E2DCD0] text-huyen-lam hover:border-[#CFC7B7]'
              }`}
            >
              <option value="all">Tất cả công việc</option>
              {activeTasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.displayCode} — {t.title}
                </option>
              ))}
            </select>

            <select
              aria-label="Lọc theo hạng mục"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className={`w-full px-3 py-2 text-[13px] rounded-xl border focus:outline-none focus:ring-2 focus:ring-lam-sang/30 min-h-[42px] transition-colors ${
                categoryFilter !== 'all'
                  ? 'bg-thanh-ngoc-soft border-thanh-ngoc/40 text-huyen-lam font-medium'
                  : 'bg-white border-[#E2DCD0] text-huyen-lam hover:border-[#CFC7B7]'
              }`}
            >
              <option value="all">Tất cả hạng mục</option>
              {sortedCategories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                  {!cat.isActive ? ' (Ngừng dùng)' : ''}
                </option>
              ))}
              <option value="__uncategorized__">Chưa phân hạng mục</option>
            </select>

            <button
              type="button"
              onClick={() => setReviewOnly((v) => !v)}
              aria-pressed={reviewOnly}
              className={`w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-[13px] font-medium rounded-xl border transition-colors min-h-[42px] whitespace-nowrap ${
                reviewOnly
                  ? 'bg-huyen-lam border-huyen-lam text-kim-quang font-semibold'
                  : 'bg-white border-[#E2DCD0] text-huyen-lam hover:bg-[#FAF8F3] hover:border-[#CFC7B7]'
              }`}
            >
              <AlertTriangle
                className={`w-4 h-4 shrink-0 ${
                  reviewOnly ? 'text-kim-quang' : 'text-minh-kim-ink'
                }`}
              />
              <span>
                Cần rà soát
                {summary.reviewNeededCount > 0
                  ? ` (${summary.reviewNeededCount})`
                  : ''}
              </span>
            </button>
          </div>
        </div>

        {/* Subtle Duplicate URL Notice (only if duplicate URLs exist across entries) */}
        {summary.duplicateEntryCount > 0 && (
          <div className="pt-2 border-t border-[#EFEAE0] flex flex-wrap items-center justify-between gap-2 text-xs text-[#5E697A]">
            <div className="flex items-center gap-1.5">
              <Copy className="w-3.5 h-3.5 text-minh-kim-ink shrink-0" />
              <span>
                Phát hiện{' '}
                <strong className="font-mono-tabular text-huyen-lam">
                  {summary.duplicateEntryCount}
                </strong>{' '}
                liên kết đang dùng trùng URL
                {summary.duplicateCrossTaskUrlCount > 0
                  ? ` (trên ${summary.duplicateCrossTaskUrlCount} đường dẫn gắn ở nhiều công việc)`
                  : ''}
                . Hệ thống giữ nguyên dữ liệu gốc để Quản trị viên rà soát.
              </span>
            </div>
            <button
              type="button"
              onClick={() => setDuplicateOnly((v) => !v)}
              aria-pressed={duplicateOnly}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap ${
                duplicateOnly
                  ? 'bg-minh-kim-soft border-minh-kim text-minh-kim-ink font-semibold'
                  : 'bg-white border-[#E2DCD0] text-huyen-lam hover:bg-[#FAF8F3]'
              }`}
            >
              {duplicateOnly ? 'Đang lọc URL trùng' : 'Chỉ xem URL trùng'}
            </button>
          </div>
        )}
      </div>

      {/* D. Document List */}
      {filteredEntries.length === 0 ? (
        <div className="bg-trang-nga border border-[#E5DFD2] rounded-2xl px-4 py-14 text-center space-y-3 shadow-[0_1px_3px_rgba(20,36,63,0.03)]">
          <div className="w-11 h-11 rounded-xl bg-[#F4F0E6] text-[#7D8796] flex items-center justify-center mx-auto">
            <Library className="w-5 h-5" />
          </div>
          <div className="space-y-1 max-w-md mx-auto">
            <p className="text-sm font-semibold text-huyen-lam">
              {summary.totalLinks === 0
                ? 'Chưa có tài liệu nào được gắn vào công việc'
                : 'Không tìm thấy tài liệu khớp với điều kiện lọc'}
            </p>
            <p className="text-xs text-[#606B7D] leading-relaxed">
              {summary.totalLinks === 0
                ? editableTasks.length > 0
                  ? 'Bạn có thể thêm liên kết tài liệu tham khảo hoặc kết quả nghiên cứu ngay tại đây và gắn vào công việc tương ứng.'
                  : 'Các liên kết tài liệu tham khảo và kết quả nghiên cứu của từng công việc sẽ tự động tập trung tại đây.'
                : 'Thử thay đổi từ khóa tìm kiếm hoặc xóa bộ lọc để xem toàn bộ tài liệu dự án.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
            {hasActiveFilter && (
              <button
                type="button"
                onClick={resetFilters}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-huyen-lam text-trang-nga rounded-xl hover:bg-lam-tri-tue transition-colors min-h-[40px]"
              >
                <RotateCcw className="w-3.5 h-3.5 shrink-0 text-kim-quang" />
                <span>Xóa toàn bộ lọc</span>
              </button>
            )}
            {summary.totalLinks === 0 && editableTasks.length > 0 && (
              <button
                type="button"
                onClick={openAddModal}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-huyen-lam text-trang-nga rounded-xl hover:bg-lam-tri-tue transition-colors min-h-[40px]"
              >
                <Plus className="w-3.5 h-3.5 shrink-0 text-kim-quang" />
                <span>Thêm liên kết đầu tiên</span>
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-trang-nga border border-[#E5DFD2] rounded-2xl shadow-[0_1px_3px_rgba(20,36,63,0.03)] overflow-hidden">
          {/* Desktop Column Header */}
          <div className="hidden lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,1.15fr)_auto] lg:items-center lg:gap-4 px-5 py-2.5 bg-[#F4F0E6]/85 border-b border-[#E5DFD2] text-[11.5px] font-semibold tracking-[0.015em] text-[#5B6678]">
            <div className="text-huyen-lam">Tài liệu &amp; Nguồn</div>
            <div>Công việc liên quan</div>
            <div className="text-right">Thao tác</div>
          </div>

          {/* Document Rows */}
          <div className="divide-y divide-[#EFEAE0]">
            {filteredEntries.map((entry) => {
              const isReference = entry.group === 'reference';
              const canEditRow = canUserEditTask(currentUser, entry.task);
              const Icon = !entry.hasValidUrl
                ? Link2Off
                : isReference
                ? BookOpen
                : FileCheck2;

              const otherTaskOccurrences = Array.from(
                new Map(
                  entry.duplicateOccurrences
                    .filter((o) => o.taskId !== entry.taskId)
                    .map((o) => [o.taskId, o])
                ).values()
              );
              const hasSameTaskDup = entry.duplicateOccurrences.some(
                (o) => o.taskId === entry.taskId
              );

              return (
                <div
                  key={entry.key}
                  className="px-3.5 py-3 sm:px-5 sm:py-3.5 hover:bg-[#FCFBF8] transition-colors"
                >
                  <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.15fr)_auto] lg:items-center gap-2.5 lg:gap-4">
                    {/* Column 1: Icon + Document Title + Unboxed Metadata */}
                    <div className="flex items-start gap-3 min-w-0">
                      <span
                        className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                          !entry.hasValidUrl
                            ? 'bg-[#EFEAE0] text-[#7D8796]'
                            : isReference
                            ? 'bg-lam-sang-soft text-lam-sang-ink'
                            : 'bg-thanh-ngoc-soft text-thanh-ngoc-ink'
                        }`}
                        aria-hidden="true"
                      >
                        <Icon className="w-4 h-4" />
                      </span>

                      <div className="min-w-0 flex-1 space-y-1">
                        {/* Primary Focal Title */}
                        {entry.hasValidUrl ? (
                          <a
                            href={entry.link.url ?? '#'}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`inline-block max-w-full text-[14.5px] sm:text-[15px] leading-snug break-words hover:text-lam-tri-tue hover:underline decoration-minh-kim/75 underline-offset-4 transition-colors ${
                              entry.isPlaceholderLabel
                                ? 'text-[#6E7889] italic font-normal'
                                : 'font-semibold text-huyen-lam'
                            }`}
                          >
                            {entry.displayLabel}
                          </a>
                        ) : (
                          <div
                            className={`text-[14.5px] sm:text-[15px] leading-snug break-words ${
                              entry.isPlaceholderLabel
                                ? 'text-[#6E7889] italic font-normal'
                                : 'font-semibold text-huyen-lam'
                            }`}
                          >
                            {entry.displayLabel}
                          </div>
                        )}

                        {/* Unboxed Metadata: Type · Source · Category · Official Assignee */}
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[#5E697A] leading-5">
                          <span
                            className={`font-medium ${
                              isReference
                                ? 'text-lam-sang-ink'
                                : 'text-thanh-ngoc-ink'
                            }`}
                          >
                            {isReference ? 'Tham khảo' : 'Kết quả'}
                          </span>
                          <span
                            className="text-[#D4CCB9] select-none"
                            aria-hidden="true"
                          >
                            ·
                          </span>
                          <span className="text-huyen-lam/85 font-medium">
                            {entry.sourceLabel}
                          </span>
                          <span
                            className="text-[#D4CCB9] select-none"
                            aria-hidden="true"
                          >
                            ·
                          </span>
                          <span>{entry.categoryName}</span>
                          <span
                            className="text-[#D4CCB9] select-none"
                            aria-hidden="true"
                          >
                            ·
                          </span>
                          <span>{entry.assigneeNamesText}</span>
                        </div>

                        {/* Quality / Duplicate Notice Line (only when applicable) */}
                        {(entry.needsReview ||
                          entry.duplicateOccurrences.length > 0) && (
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] pt-0.5">
                            {entry.isPlaceholderLabel && (
                              <span className="inline-flex items-center gap-1 font-medium text-minh-kim-ink">
                                <AlertTriangle className="w-3 h-3 shrink-0" />
                                <span>Chưa đặt tên rõ ràng</span>
                              </span>
                            )}
                            {entry.isMissingUrl && (
                              <span className="inline-flex items-center gap-1 font-medium text-minh-kim-ink">
                                <Link2Off className="w-3 h-3 shrink-0" />
                                <span>Chưa gắn đường dẫn</span>
                              </span>
                            )}
                            {entry.isInvalidUrl && (
                              <span className="inline-flex items-center gap-1 font-medium text-chu-sa">
                                <AlertTriangle className="w-3 h-3 shrink-0" />
                                <span>Đường dẫn không hợp lệ</span>
                              </span>
                            )}
                            {hasSameTaskDup && (
                              <span className="inline-flex items-center gap-1 font-medium text-minh-kim-ink">
                                <Copy className="w-3 h-3 shrink-0" />
                                <span>Trùng URL trong cùng công việc</span>
                              </span>
                            )}
                            {otherTaskOccurrences.length > 0 && (
                              <span className="inline-flex items-center flex-wrap gap-1 text-minh-kim-ink">
                                <Copy className="w-3 h-3 shrink-0" />
                                <span>Cũng gắn ở việc:</span>
                                {otherTaskOccurrences.map((occ, idx) => (
                                  <React.Fragment key={occ.taskId}>
                                    {idx > 0 && <span>,</span>}
                                    <button
                                      type="button"
                                      onClick={() => onSelectTask(occ.taskId)}
                                      title={`${occ.taskCode} — ${occ.taskTitle}`}
                                      className="font-mono-tabular font-semibold underline decoration-minh-kim/70 underline-offset-2 hover:text-huyen-lam"
                                    >
                                      {occ.taskCode}
                                    </button>
                                  </React.Fragment>
                                ))}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Column 2: Related Task (Clickable -> Task Focus Drawer) */}
                    <div className="pl-11 lg:pl-0 min-w-0">
                      <button
                        type="button"
                        onClick={() => onSelectTask(entry.taskId)}
                        className="text-left max-w-full group focus-visible:outline-2 focus-visible:outline-lam-sang rounded-md py-0.5"
                      >
                        <div className="flex items-baseline gap-1.5 min-w-0">
                          <span className="font-mono-tabular text-[11.5px] font-bold px-1.5 py-0.5 rounded bg-[#F3EFE6] border border-[#E2DCCE] text-huyen-lam shrink-0">
                            {entry.taskCode}
                          </span>
                          <span className="text-[13px] font-medium text-huyen-lam/90 group-hover:text-lam-tri-tue group-hover:underline decoration-minh-kim/70 underline-offset-4 line-clamp-2 break-words transition-colors">
                            {entry.taskTitle}
                          </span>
                        </div>
                      </button>
                    </div>

                    {/* Column 3: Actions */}
                    <div className="pl-11 lg:pl-0 flex items-center justify-start lg:justify-end gap-1.5 shrink-0">
                      {entry.hasValidUrl && (
                        <a
                          href={entry.link.url ?? '#'}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`Mở liên kết ${entry.displayLabel} trong tab mới`}
                          className="inline-flex items-center gap-1.5 px-3 h-[36px] rounded-lg border border-[#DDD6C7] bg-white hover:bg-[#FAF8F3] hover:border-lam-sang/55 text-xs font-semibold text-lam-tri-tue hover:text-huyen-lam transition-colors whitespace-nowrap"
                        >
                          <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                          <span>Mở liên kết</span>
                        </a>
                      )}

                      {canEditRow && (
                        <>
                          <button
                            type="button"
                            onClick={() => openEditModal(entry)}
                            title="Chỉnh sửa liên kết"
                            aria-label={`Chỉnh sửa ${entry.displayLabel}`}
                            className="w-9 h-9 flex items-center justify-center rounded-lg border border-[#E2DCD0] bg-white text-[#5E697A] hover:text-huyen-lam hover:bg-[#FAF8F3] transition-colors shrink-0"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setDeleteError(null);
                              setDeleteTarget({
                                entry,
                                openedVersion: entry.task.version,
                              });
                            }}
                            title="Xóa liên kết khỏi công việc"
                            aria-label={`Xóa ${entry.displayLabel}`}
                            className="w-9 h-9 flex items-center justify-center rounded-lg border border-[#E2DCD0] bg-white text-[#7D8796] hover:text-chu-sa hover:border-chu-sa-border hover:bg-chu-sa-soft transition-colors shrink-0"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Modal: Add / Edit Document Link */}
      {editorModal && (
        <div
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !editorSaving) {
              setEditorModal(null);
              setEditorError(null);
            }
          }}
          role="dialog"
          aria-modal="true"
          aria-label={
            editorModal.mode === 'add'
              ? 'Thêm liên kết tài liệu mới'
              : 'Chỉnh sửa liên kết tài liệu'
          }
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-huyen-lam/45 backdrop-blur-[1.5px] overscroll-contain"
        >
          <div className="w-full max-w-[500px] bg-trang-nga border border-[#DFD8CA] rounded-2xl shadow-[0_24px_60px_-16px_rgba(20,36,63,0.3)] overflow-hidden">
            <header className="px-4 sm:px-5 py-3.5 bg-[#FAF8F3] border-b border-[#EAE3D5] flex items-center justify-between gap-2">
              <div className="min-w-0">
                <h2 className="text-base font-bold text-huyen-lam">
                  {editorModal.mode === 'add'
                    ? 'Thêm liên kết tài liệu'
                    : 'Chỉnh sửa liên kết'}
                </h2>
                <p className="text-xs text-[#667182] mt-0.5 truncate">
                  Lưu trực tiếp vào dữ liệu công việc gốc
                </p>
              </div>
              <button
                type="button"
                disabled={editorSaving}
                onClick={() => {
                  setEditorModal(null);
                  setEditorError(null);
                }}
                aria-label="Đóng hộp thoại"
                className="w-9 h-9 flex items-center justify-center rounded-lg text-[#667182] hover:bg-[#EFEAE0] hover:text-huyen-lam transition-colors disabled:opacity-40"
              >
                <X className="w-[18px] h-[18px]" />
              </button>
            </header>

            <form
              onSubmit={handleSubmitEditor}
              className="p-4 sm:p-5 space-y-4 max-h-[80dvh] overflow-y-auto overscroll-contain"
            >
              {/* Task Selector (Add mode) or Read-only Task Context (Edit mode) */}
              {editorModal.mode === 'add' ? (
                <div>
                  <label
                    htmlFor="doc-center-task-select"
                    className="block text-xs font-semibold text-huyen-lam mb-1"
                  >
                    Công việc liên quan <span className="text-chu-sa">*</span>
                  </label>
                  <select
                    id="doc-center-task-select"
                    value={editorModal.taskId}
                    disabled={editorSaving}
                    onChange={(e) => {
                      setEditorModal({
                        ...editorModal,
                        taskId: e.target.value,
                      });
                      setEditorError(null);
                    }}
                    className="w-full h-[40px] px-3 text-[13px] bg-white border border-[#DFD8CA] rounded-xl text-huyen-lam focus:outline-none focus:ring-2 focus:ring-lam-sang/25 focus:border-lam-sang"
                  >
                    {editableTasks.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.displayCode} — {t.title}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="px-3 py-2.5 rounded-xl bg-[#FAF8F3] border border-[#E7E1D4] text-xs space-y-0.5">
                  <div className="text-[#6E7889]">Công việc liên quan</div>
                  <div className="font-semibold text-huyen-lam break-words">
                    <span className="font-mono-tabular mr-1.5">
                      {modalSelectedTask?.displayCode ?? ''}
                    </span>
                    <span>
                      {modalSelectedTask?.title ?? 'Công việc không xác định'}
                    </span>
                  </div>
                </div>
              )}

              {/* Concurrent Version Conflict Notice */}
              {editorSelectedTaskLiveVersionMismatch && modalSelectedTask && (
                <div
                  role="alert"
                  className="p-3 rounded-xl bg-chu-sa-soft border border-chu-sa-border text-xs text-chu-sa space-y-2"
                >
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>
                      Công việc này vừa được cập nhật lên{' '}
                      <strong>v{modalSelectedTask.version}</strong>. Vui lòng
                      tải bản mới nhất trước khi lưu để tránh ghi đè thay đổi
                      của người khác.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleReloadLatestForEdit}
                    className="px-3 h-[32px] text-xs font-semibold bg-white border border-chu-sa-border text-chu-sa rounded-lg hover:bg-[#FFF5F5]"
                  >
                    Tải bản mới nhất (v{modalSelectedTask.version})
                  </button>
                </div>
              )}

              {/* Document Group Choice */}
              <div className="space-y-1.5">
                <span className="block text-xs font-semibold text-huyen-lam">
                  Nhóm tài liệu <span className="text-chu-sa">*</span>
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {(
                    [
                      {
                        value: 'reference',
                        title: 'Tài liệu cần đọc / tham khảo',
                        desc: 'Nguồn tài liệu để thực hiện công việc',
                        Icon: BookOpen,
                        activeClass:
                          'bg-lam-sang-soft border-lam-sang text-lam-sang-ink',
                      },
                      {
                        value: 'result',
                        title: 'Kết quả nghiên cứu',
                        desc: 'Bản thảo, báo cáo và sản phẩm tạo ra',
                        Icon: FileCheck2,
                        activeClass:
                          'bg-thanh-ngoc-soft border-thanh-ngoc text-thanh-ngoc-ink',
                      },
                    ] as const
                  ).map((opt) => {
                    const selected = modalTargetGroup === opt.value;
                    const OptIcon = opt.Icon;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        disabled={editorSaving}
                        aria-pressed={selected}
                        onClick={() => {
                          setEditorError(null);
                          if (editorModal.mode === 'add') {
                            setEditorModal({
                              ...editorModal,
                              group: opt.value,
                            });
                          } else {
                            setEditorModal({
                              ...editorModal,
                              toGroup: opt.value,
                            });
                          }
                        }}
                        className={`p-2.5 rounded-xl border text-left transition-colors ${
                          selected
                            ? opt.activeClass
                            : 'bg-white border-[#DFD8CA] text-huyen-lam hover:bg-[#FAF8F3]'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 text-xs font-semibold">
                          <OptIcon className="w-3.5 h-3.5 shrink-0" />
                          <span>{opt.title}</span>
                        </div>
                        <p className="text-[11px] opacity-85 mt-0.5 leading-snug">
                          {opt.desc}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Document Title */}
              <div>
                <label
                  htmlFor="doc-center-label-input"
                  className="block text-xs font-semibold text-huyen-lam mb-1"
                >
                  Tên tài liệu <span className="text-chu-sa">*</span>
                </label>
                <input
                  id="doc-center-label-input"
                  type="text"
                  autoFocus
                  maxLength={200}
                  disabled={editorSaving}
                  value={editorModal.label}
                  onChange={(e) => {
                    setEditorModal({
                      ...editorModal,
                      label: e.target.value,
                    });
                    if (editorError) setEditorError(null);
                  }}
                  placeholder={
                    modalTargetGroup === 'reference'
                      ? 'Ví dụ: Kinh Lăng Già — bản đối chiếu Hán Việt'
                      : 'Ví dụ: Bản thảo phần 1 — Tổng quan đề cương'
                  }
                  className="w-full h-[40px] px-3 text-[13.5px] bg-white border border-[#DFD8CA] rounded-xl text-huyen-lam placeholder:text-[#969EAE] focus:outline-none focus:ring-2 focus:ring-lam-sang/25 focus:border-lam-sang"
                />
              </div>

              {/* Document URL */}
              <div>
                <label
                  htmlFor="doc-center-url-input"
                  className="block text-xs font-semibold text-huyen-lam mb-1"
                >
                  Đường dẫn (URL) <span className="text-chu-sa">*</span>
                </label>
                <input
                  id="doc-center-url-input"
                  type="url"
                  disabled={editorSaving}
                  value={editorModal.url}
                  onChange={(e) => {
                    setEditorModal({
                      ...editorModal,
                      url: e.target.value,
                    });
                    if (editorError) setEditorError(null);
                  }}
                  placeholder="https://drive.google.com/..."
                  className="w-full h-[40px] px-3 text-xs font-mono-tabular bg-white border border-[#DFD8CA] rounded-xl text-huyen-lam placeholder:text-[#969EAE] focus:outline-none focus:ring-2 focus:ring-lam-sang/25 focus:border-lam-sang"
                />
              </div>

              {/* Non-blocking duplicate URL warning */}
              {editorUrlDuplicateWarning && (
                <div className="px-3 py-2 rounded-xl bg-minh-kim-soft border border-minh-kim-border text-xs text-minh-kim-ink flex items-start gap-2">
                  <Copy className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{editorUrlDuplicateWarning}</span>
                </div>
              )}

              {/* Group cap warning */}
              {modalGroupCapReached && (
                <div
                  role="alert"
                  className="px-3 py-2 rounded-xl bg-chu-sa-soft border border-chu-sa-border text-xs text-chu-sa flex items-start gap-2"
                >
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>
                    Nhóm này trên công việc đã đạt tối đa{' '}
                    {MAX_LINKS_PER_GROUP} liên kết.
                  </span>
                </div>
              )}

              {/* Validation / Save Error */}
              {editorError && (
                <div
                  role="alert"
                  className="px-3 py-2.5 rounded-xl bg-chu-sa-soft border border-chu-sa-border text-xs font-medium text-chu-sa flex items-start gap-2"
                >
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{editorError}</span>
                </div>
              )}

              <div className="pt-2 border-t border-[#EAE3D5] flex items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={editorSaving}
                  onClick={() => {
                    setEditorModal(null);
                    setEditorError(null);
                  }}
                  className="px-4 h-[40px] text-xs font-medium text-[#5E697A] hover:text-huyen-lam hover:bg-[#EFEAE0] rounded-xl transition-colors disabled:opacity-45"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={
                    editorSaving ||
                    modalGroupCapReached ||
                    editorSelectedTaskLiveVersionMismatch
                  }
                  className="inline-flex items-center gap-1.5 px-4 h-[40px] text-xs font-semibold bg-huyen-lam text-trang-nga hover:bg-lam-tri-tue rounded-xl transition-colors disabled:opacity-45"
                >
                  <Save className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    {editorSaving
                      ? 'Đang lưu...'
                      : editorModal.mode === 'add'
                      ? 'Thêm vào công việc'
                      : 'Lưu thay đổi'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Delete Confirmation */}
      {deleteTarget && (
        <div
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !deleting) {
              setDeleteTarget(null);
              setDeleteError(null);
            }
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Xác nhận xóa liên kết"
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-huyen-lam/45 backdrop-blur-[1.5px] overscroll-contain"
        >
          <div className="w-full max-w-[440px] bg-trang-nga border border-[#DFD8CA] rounded-2xl shadow-[0_24px_60px_-16px_rgba(20,36,63,0.3)] overflow-hidden p-4 sm:p-5 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-chu-sa-soft border border-chu-sa-border text-chu-sa flex items-center justify-center shrink-0">
                <Trash2 className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <h2 className="text-base font-bold text-huyen-lam">
                  Gỡ liên kết khỏi công việc?
                </h2>
                <p className="text-xs text-[#5E697A] leading-relaxed">
                  Liên kết{' '}
                  <strong className="text-huyen-lam">
                    {deleteTarget.entry.displayLabel}
                  </strong>{' '}
                  sẽ được gỡ khỏi công việc{' '}
                  <strong className="font-mono-tabular text-huyen-lam">
                    {deleteTarget.entry.taskCode}
                  </strong>
                  . Tệp gốc trên Google Drive hoặc trang ngoài sẽ không bị xóa.
                </p>
              </div>
            </div>

            {deleteError && (
              <div
                role="alert"
                className="px-3 py-2.5 rounded-xl bg-chu-sa-soft border border-chu-sa-border text-xs font-medium text-chu-sa flex items-start gap-2"
              >
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{deleteError}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                disabled={deleting}
                onClick={() => {
                  setDeleteTarget(null);
                  setDeleteError(null);
                }}
                className="px-4 h-[38px] text-xs font-medium text-[#5E697A] hover:text-huyen-lam hover:bg-[#EFEAE0] rounded-xl transition-colors disabled:opacity-45"
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={handleConfirmDelete}
                className="inline-flex items-center gap-1.5 px-4 h-[38px] text-xs font-semibold bg-chu-sa text-white hover:opacity-90 rounded-xl transition-opacity disabled:opacity-45"
              >
                <Trash2 className="w-3.5 h-3.5 shrink-0" />
                <span>{deleting ? 'Đang gỡ...' : 'Xác nhận gỡ'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
