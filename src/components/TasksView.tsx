import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  Archive,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  CornerDownRight,
  ExternalLink,
  Link2Off,
  ListChecks,
  Plus,
  RotateCcw,
  Search,
  X,
} from 'lucide-react';
import { CategoryItem, ProjectMember, TaskItem } from '../types/project';
import {
  ALL_STATUSES,
  canUserCreateSubtask,
  computeParentProgress,
  formatShortDate,
  getEffectiveCategory,
  isB1TestTask,
  isTaskOverdue,
} from '../utils/taskHelpers';
import { StatusBadge } from './StatusBadge';

interface TasksViewProps {
  tasks: TaskItem[];
  categories: CategoryItem[];
  currentUser: ProjectMember;
  initialStatusFilter?: string;
  initialCategoryFilter?: string;
  initialReviewOnly?: boolean;
  onSelectTask: (taskId: string) => void;
  onOpenNewTask: (defaultParentId?: string | null) => void;
}

interface CategoryTheme {
  accent: string;
  text: string;
  softBg: string;
  softBorder: string;
}

function getCategoryVisualTheme(
  categoryId: string | null,
  categoryName: string,
  fallbackColor?: string
): CategoryTheme {
  const nameKey = categoryName.trim().toLowerCase();
  if (categoryId === 'cat_outline' || nameKey.includes('đề cương')) {
    return {
      accent: '#477FAE',
      text: '#285780',
      softBg: '#EFF6FB',
      softBorder: '#CEE1F2',
    };
  }
  if (categoryId === 'cat_foundation' || nameKey.includes('nền tảng')) {
    return {
      accent: '#328578',
      text: '#1F5E54',
      softBg: '#EEF7F5',
      softBorder: '#C7E3DE',
    };
  }
  if (categoryId === 'cat_research' || nameKey.includes('truy nguồn')) {
    return {
      accent: '#C9A14B',
      text: '#78530E',
      softBg: '#FBF6E8',
      softBorder: '#E7D5A3',
    };
  }
  return {
    accent: fallbackColor || '#477FAE',
    text: '#14243F',
    softBg: '#F4F6F9',
    softBorder: '#DCE3EC',
  };
}

const DESKTOP_GRID_COLS =
  'lg:grid lg:grid-cols-[minmax(0,1fr)_136px_174px_206px_98px] lg:items-center lg:gap-4';

export const TasksView: React.FC<TasksViewProps> = ({
  tasks,
  categories,
  currentUser,
  initialStatusFilter = 'all',
  initialCategoryFilter = 'all',
  initialReviewOnly = false,
  onSelectTask,
  onOpenNewTask,
}) => {
  const isManager =
    (currentUser.role === 'admin' || currentUser.role === 'moderator') &&
    currentUser.isActive;
  const canCreate = canUserCreateSubtask(currentUser);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>(initialStatusFilter);
  const [categoryFilter, setCategoryFilter] = useState<string>(
    initialCategoryFilter
  );
  const [assigneeFilter, setAssigneeFilter] = useState<string>('all');
  const [reviewOnly, setReviewOnly] = useState<boolean>(initialReviewOnly);
  const [showArchived, setShowArchived] = useState<boolean>(false);
  const [expandedParents, setExpandedParents] = useState<Record<string, boolean>>({
    tbhgn_3: true,
    tbhgn_4: true,
    tbhgn_5: true,
  });

  const sortedCategories = useMemo(
    () => [...categories].sort((a, b) => a.sortOrder - b.sortOrder),
    [categories]
  );

  const visiblePool = useMemo(() => {
    return tasks.filter(
      (t) => !isB1TestTask(t) && (showArchived ? true : !t.archivedAt)
    );
  }, [tasks, showArchived]);

  const assigneeOptions = useMemo(() => {
    const set = new Set<string>();
    visiblePool.forEach((t) => {
      t.assignees.forEach((a) => {
        if (a.trim()) set.add(a.trim());
      });
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'vi'));
  }, [visiblePool]);

  const reviewFlagCount = useMemo(
    () => visiblePool.filter((t) => t.reviewFlags.length > 0).length,
    [visiblePool]
  );

  const unlinkedUidCount = useMemo(
    () =>
      visiblePool.filter(
        (t) => t.assignees.length > 0 && t.assigneeUids.length === 0
      ).length,
    [visiblePool]
  );

  const hasActiveFilter =
    searchQuery.trim() !== '' ||
    statusFilter !== 'all' ||
    categoryFilter !== 'all' ||
    assigneeFilter !== 'all' ||
    reviewOnly;

  const hasChildRestrictingFilter =
    statusFilter !== 'all' || assigneeFilter !== 'all' || reviewOnly;

  const matchesFilter = (task: TaskItem): boolean => {
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      const effForSearch = getEffectiveCategory(task, visiblePool, categories);
      const hay = [
        task.displayCode,
        task.title,
        task.assignees.join(' '),
        task.nextStep ?? '',
        task.notes ?? '',
        effForSearch.category ?? '',
      ]
        .join(' ')
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }

    if (statusFilter !== 'all') {
      if (statusFilter === '__unset__') {
        if (task.status !== null) return false;
      } else if (task.status !== statusFilter) {
        return false;
      }
    }

    if (categoryFilter !== 'all') {
      const eff = getEffectiveCategory(task, visiblePool, categories);
      if (categoryFilter === '__uncategorized__') {
        if (eff.categoryId || eff.category) return false;
      } else if (eff.categoryId !== categoryFilter) {
        return false;
      }
    }

    if (assigneeFilter !== 'all') {
      if (assigneeFilter === '__unassigned__') {
        if (task.assignees.length > 0 || task.assigneeUids.length > 0) {
          return false;
        }
      } else if (assigneeFilter === '__unlinked_uid__') {
        if (task.assigneeUids.length > 0) {
          return false;
        }
      } else if (!task.assignees.includes(assigneeFilter)) {
        return false;
      }
    }

    if (reviewOnly && task.reviewFlags.length === 0) {
      return false;
    }

    return true;
  };

  const parentTasks = useMemo(() => {
    return visiblePool
      .filter((t) => t.parentId === null)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }, [visiblePool]);

  const childrenByParent = useMemo(() => {
    const map: Record<string, TaskItem[]> = {};
    visiblePool
      .filter((t) => t.parentId !== null)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .forEach((child) => {
        if (!child.parentId) return;
        if (!map[child.parentId]) map[child.parentId] = [];
        map[child.parentId].push(child);
      });
    return map;
  }, [visiblePool]);

  const filteredTree = useMemo(() => {
    return parentTasks
      .map((parent) => {
        const children = childrenByParent[parent.id] || [];
        const parentMatches = matchesFilter(parent);
        const matchingChildren = children.filter(matchesFilter);

        if (!hasActiveFilter) {
          return { parent, children, autoExpand: false };
        }
        if (matchingChildren.length > 0) {
          return {
            parent,
            children: matchingChildren,
            autoExpand: true,
          };
        }
        if (parentMatches) {
          return {
            parent,
            children: hasChildRestrictingFilter ? [] : children,
            autoExpand: false,
          };
        }
        return null;
      })
      .filter(Boolean) as Array<{
      parent: TaskItem;
      children: TaskItem[];
      autoExpand: boolean;
    }>;
  }, [
    parentTasks,
    childrenByParent,
    hasActiveFilter,
    hasChildRestrictingFilter,
    searchQuery,
    statusFilter,
    categoryFilter,
    assigneeFilter,
    reviewOnly,
    visiblePool,
    categories,
  ]);

  const parentsWithVisibleChildren = useMemo(
    () => filteredTree.filter((item) => item.children.length > 0),
    [filteredTree]
  );

  const allExpanded =
    parentsWithVisibleChildren.length > 0 &&
    parentsWithVisibleChildren.every(
      (item) => item.autoExpand || Boolean(expandedParents[item.parent.id])
    );

  const visibleChildCount = useMemo(
    () => filteredTree.reduce((sum, item) => sum + item.children.length, 0),
    [filteredTree]
  );
  const visibleTotalCount = filteredTree.length + visibleChildCount;

  const toggleParent = (parentId: string) => {
    setExpandedParents((prev) => ({
      ...prev,
      [parentId]: !prev[parentId],
    }));
  };

  const toggleExpandAll = () => {
    const nextState = !allExpanded;
    const nextMap: Record<string, boolean> = { ...expandedParents };
    parentsWithVisibleChildren.forEach(({ parent }) => {
      nextMap[parent.id] = nextState;
    });
    setExpandedParents(nextMap);
  };

  const resetFilters = () => {
    setSearchQuery('');
    setStatusFilter('all');
    setCategoryFilter('all');
    setAssigneeFilter('all');
    setReviewOnly(false);
  };

  const renderAssigneeCell = (task: TaskItem) => {
    if (task.assignees.length === 0 && task.assigneeUids.length === 0) {
      return (
        <span className="text-[13px] text-slate-400 italic">
          Chưa phân công
        </span>
      );
    }

    const isUnlinkedForManager =
      isManager && task.assignees.length > 0 && task.assigneeUids.length === 0;

    return (
      <div className="min-w-0 inline-flex items-center gap-1.5 flex-wrap">
        <span className="text-[13px] font-medium text-huyen-lam leading-snug break-words">
          {task.assignees.length > 0
            ? task.assignees.join(', ')
            : 'Đã gắn tài khoản'}
        </span>
        {isUnlinkedForManager && (
          <span
            title="Chưa liên kết tài khoản Google (UID)"
            aria-label="Chưa liên kết tài khoản Google"
            className="inline-flex items-center text-slate-400 shrink-0"
          >
            <Link2Off className="w-3.5 h-3.5 shrink-0" />
          </span>
        )}
      </div>
    );
  };

  const renderDueDateCell = (task: TaskItem, alignRight: boolean) => {
    if (!task.dueDate) {
      return (
        <span
          className={`text-[13px] font-mono-tabular text-slate-300 select-none ${
            alignRight ? 'block text-right' : ''
          }`}
        >
          —
        </span>
      );
    }
    const overdue = isTaskOverdue(task);
    return (
      <span
        className={`text-[13px] font-mono-tabular whitespace-nowrap ${
          alignRight ? 'block text-right' : ''
        } ${
          overdue ? 'text-chu-sa font-semibold' : 'text-slate-600'
        }`}
        title={overdue ? 'Quá hạn xử lý' : undefined}
      >
        {formatShortDate(task.dueDate)}
      </span>
    );
  };

  const renderDriveLinkAction = (task: TaskItem) => {
    const validLinks = task.resultLinks.filter((l) => Boolean(l.url));
    if (validLinks.length === 0) return null;
    const primary = validLinks[0];
    return (
      <a
        href={primary.url ?? '#'}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        title={
          validLinks.length > 1
            ? `${primary.label} (+${validLinks.length - 1} tài liệu khác)`
            : primary.label
        }
        className="inline-flex items-center gap-1.5 text-xs font-medium text-lam-sang-ink hover:text-huyen-lam hover:underline whitespace-nowrap shrink-0"
      >
        <ExternalLink className="w-3.5 h-3.5 shrink-0" />
        <span>
          {validLinks.length > 1
            ? `${validLinks.length} tài liệu KQ`
            : 'Tài liệu KQ'}
        </span>
      </a>
    );
  };

  return (
    <div className="space-y-4">
      {/* Screen Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl sm:text-2xl font-bold text-huyen-lam tracking-tight">
              Danh sách công việc
            </h1>
            <span
              className="hidden sm:inline-block h-[2px] w-5 bg-chu-sa/75 rounded-full"
              aria-hidden="true"
            />
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1 tabular-nums">
            <span className="font-semibold text-huyen-lam">
              {parentTasks.length}
            </span>{' '}
            đầu việc cha ·{' '}
            <span className="font-semibold text-huyen-lam">
              {visiblePool.length}
            </span>{' '}
            công việc đang hoạt động
            {showArchived ? ' (bao gồm lưu trữ)' : ''}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {parentsWithVisibleChildren.length > 0 && !hasActiveFilter && (
            <button
              type="button"
              onClick={toggleExpandAll}
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 bg-trang-nga text-huyen-lam text-xs sm:text-[13px] font-medium hover:bg-nen-sang hover:border-slate-300 transition-colors whitespace-nowrap min-h-[42px]"
            >
              {allExpanded ? (
                <>
                  <ChevronsDownUp className="w-4 h-4 shrink-0 text-slate-500" />
                  <span>Thu gọn việc con</span>
                </>
              ) : (
                <>
                  <ChevronsUpDown className="w-4 h-4 shrink-0 text-lam-sang" />
                  <span>Mở tất cả việc con</span>
                </>
              )}
            </button>
          )}

          {canCreate && (
            <button
              type="button"
              onClick={() => onOpenNewTask(null)}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-huyen-lam text-trang-nga text-sm font-semibold hover:bg-lam-tri-tue transition-colors whitespace-nowrap shrink-0 min-h-[42px]"
            >
              <Plus className="w-4 h-4 shrink-0 text-kim-quang" />
              <span>{isManager ? 'Thêm đầu việc' : 'Thêm việc con'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Luminous Search & Filter Bar */}
      <div className="bg-trang-nga border border-slate-200/90 rounded-2xl p-3 sm:p-4 space-y-3 shadow-[0_1px_2px_rgba(20,36,63,0.03)]">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
          <div className="relative flex-1 min-w-0">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm theo mã, tên việc, người phụ trách, bước tiếp theo..."
              aria-label="Tìm kiếm công việc"
              className="w-full pl-10 pr-10 py-2 text-sm bg-nen-sang border border-slate-200 rounded-xl text-huyen-lam placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-lam-sang/40 focus:border-lam-sang focus:bg-white min-h-[42px] transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Xóa từ khóa tìm kiếm"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center rounded-lg text-slate-400 hover:text-huyen-lam hover:bg-slate-200/60 transition-colors"
              >
                <X className="w-4 h-4 shrink-0" />
              </button>
            )}
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-2.5 shrink-0">
            <div className="text-xs sm:text-[13px] text-slate-500 tabular-nums whitespace-nowrap px-1">
              Đang xem{' '}
              <span
                className={`font-mono-tabular font-semibold ${
                  hasActiveFilter ? 'text-lam-sang-ink' : 'text-huyen-lam'
                }`}
              >
                {visibleTotalCount}/{visiblePool.length}
              </span>{' '}
              việc
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

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          <select
            aria-label="Lọc theo trạng thái"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className={`w-full px-3 py-2 text-[13px] rounded-xl border focus:outline-none focus:ring-2 focus:ring-lam-sang/40 min-h-[42px] transition-colors ${
              statusFilter !== 'all'
                ? 'bg-lam-sang-soft border-lam-sang/40 text-huyen-lam font-medium'
                : 'bg-white border-slate-200 text-huyen-lam'
            }`}
          >
            <option value="all">Tất cả trạng thái</option>
            {ALL_STATUSES.map((st) => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
            <option value="__unset__">Chưa có trạng thái (Cần rà soát)</option>
          </select>

          <select
            aria-label="Lọc theo hạng mục"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className={`w-full px-3 py-2 text-[13px] rounded-xl border focus:outline-none focus:ring-2 focus:ring-lam-sang/40 min-h-[42px] transition-colors ${
              categoryFilter !== 'all'
                ? 'bg-thanh-ngoc-soft border-thanh-ngoc/40 text-huyen-lam font-medium'
                : 'bg-white border-slate-200 text-huyen-lam'
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

          <select
            aria-label="Lọc theo người phụ trách"
            value={assigneeFilter}
            onChange={(e) => setAssigneeFilter(e.target.value)}
            className={`w-full px-3 py-2 text-[13px] rounded-xl border focus:outline-none focus:ring-2 focus:ring-lam-sang/40 min-h-[42px] transition-colors ${
              assigneeFilter !== 'all'
                ? 'bg-minh-kim-soft border-minh-kim-border text-huyen-lam font-medium'
                : 'bg-white border-slate-200 text-huyen-lam'
            }`}
          >
            <option value="all">Tất cả người phụ trách</option>
            <option value="__unassigned__">Chưa phân công</option>
            {isManager && (
              <option value="__unlinked_uid__">
                Chưa liên kết tài khoản ({unlinkedUidCount})
              </option>
            )}
            {assigneeOptions.map((person) => (
              <option key={person} value={person}>
                {person}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => setReviewOnly((v) => !v)}
            aria-pressed={reviewOnly}
            className={`w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-[13px] font-medium rounded-xl border transition-colors min-h-[42px] whitespace-nowrap ${
              reviewOnly
                ? 'bg-huyen-lam border-huyen-lam text-kim-quang font-semibold'
                : 'bg-white border-slate-200 text-huyen-lam hover:bg-nen-sang'
            }`}
          >
            <AlertCircle
              className={`w-4 h-4 shrink-0 ${
                reviewOnly ? 'text-kim-quang' : 'text-minh-kim-ink'
              }`}
            />
            <span>
              Cần rà soát
              {reviewFlagCount > 0 ? ` (${reviewFlagCount})` : ''}
            </span>
          </button>
        </div>
      </div>

      {/* Serene Luminous Hybrid Workspace Container */}
      <div className="bg-nen-sang border border-slate-200/80 rounded-2xl p-1.5 sm:p-3 space-y-2.5">
        {/* Desktop Crisp Architectural Column Header */}
        {filteredTree.length > 0 && (
          <div
            className={`hidden ${DESKTOP_GRID_COLS} px-4 py-2.5 bg-trang-nga border border-slate-200/85 border-b-2 border-b-huyen-lam/20 rounded-xl text-xs font-semibold text-slate-600`}
          >
            <div className="pl-[46px] text-huyen-lam">Công việc &amp; Hạng mục</div>
            <div className="text-huyen-lam">Trạng thái</div>
            <div>Người phụ trách</div>
            <div>Bước tiếp theo</div>
            <div className="text-right">Hạn xử lý</div>
          </div>
        )}

        {/* Group Cards */}
        {filteredTree.length === 0 ? (
          <div className="bg-trang-nga border border-slate-200/80 rounded-xl px-4 py-12 text-center space-y-3">
            <p className="text-sm text-slate-500">
              {tasks.filter((t) => !isB1TestTask(t)).length === 0
                ? 'Chưa có công việc nào trên hệ thống.'
                : 'Không tìm thấy công việc nào khớp với điều kiện lọc hiện tại.'}
            </p>
            {hasActiveFilter && (
              <button
                type="button"
                onClick={resetFilters}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-huyen-lam text-trang-nga rounded-lg hover:bg-lam-tri-tue transition-colors min-h-[42px]"
              >
                <RotateCcw className="w-4 h-4 shrink-0 text-kim-quang" />
                <span>Đặt lại toàn bộ bộ lọc</span>
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredTree.map(({ parent, children, autoExpand }) => {
              const totalChildrenInParent =
                (childrenByParent[parent.id] || []).length;
              const hasChildren = children.length > 0;
              const isExpanded =
                hasChildren &&
                (autoExpand || Boolean(expandedParents[parent.id]));
              const progress = computeParentProgress(parent.id, visiblePool);
              const effCat = getEffectiveCategory(
                parent,
                visiblePool,
                categories
              );
              const catTheme = getCategoryVisualTheme(
                effCat.categoryId,
                effCat.category,
                effCat.color
              );
              const parentDriveNode = renderDriveLinkAction(parent);
              const isParentDone =
                progress.total > 0 && progress.completed === progress.total;

              return (
                <section
                  key={parent.id}
                  aria-label={`Nhóm công việc ${parent.displayCode}: ${parent.title}`}
                  className="bg-trang-nga border border-slate-200/90 hover:border-slate-300/90 rounded-xl overflow-hidden shadow-[0_1px_2px_rgba(20,36,63,0.03)] transition-colors"
                >
                  {/* Parent Row */}
                  <div
                    onClick={() => onSelectTask(parent.id)}
                    className="px-3 py-3.5 sm:px-4 sm:py-4 bg-trang-nga hover:bg-slate-50/75 transition-colors cursor-pointer"
                  >
                    <div className={DESKTOP_GRID_COLS}>
                      {/* Column 1: Chevron + Tinted Code Seal + Dominant Parent Title + Unified Meta */}
                      <div className="flex items-start gap-2.5 min-w-0">
                        <div
                          className={`shrink-0 pt-0.5 ${
                            hasChildren
                              ? 'w-9 flex items-start justify-center'
                              : 'hidden lg:flex lg:w-9 lg:items-start lg:justify-center'
                          }`}
                        >
                          {hasChildren ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleParent(parent.id);
                              }}
                              aria-expanded={isExpanded}
                              aria-label={
                                isExpanded
                                  ? `Thu gọn việc con của ${parent.displayCode}`
                                  : `Mở rộng việc con của ${parent.displayCode}`
                              }
                              className="w-10 h-10 -my-1.5 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-huyen-lam transition-colors"
                            >
                              {isExpanded ? (
                                <ChevronDown className="w-4 h-4 shrink-0" />
                              ) : (
                                <ChevronRight className="w-4 h-4 shrink-0" />
                              )}
                            </button>
                          ) : (
                            <span
                              aria-hidden="true"
                              className="w-9 h-7 inline-flex items-center justify-center text-slate-300"
                            >
                              ·
                            </span>
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          {/* Mobile (< sm) Top Row: Airy Category-Tinted Code Seal + StatusBadge */}
                          <div className="flex sm:hidden items-center justify-between gap-2 mb-1.5">
                            <span
                              style={{
                                backgroundColor: catTheme.softBg,
                                color: catTheme.text,
                                borderColor: catTheme.softBorder,
                              }}
                              className="font-mono-tabular text-xs font-bold min-w-[28px] h-6 px-2 inline-flex items-center justify-center rounded-md border shrink-0"
                            >
                              {parent.displayCode}
                            </span>
                            <StatusBadge status={parent.status} compact />
                          </div>

                          <div className="flex items-start justify-between gap-2.5">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onSelectTask(parent.id);
                              }}
                              className="text-left flex-1 min-w-0 group focus-visible:outline-2 focus-visible:outline-lam-sang rounded-sm"
                            >
                              <div className="flex items-start gap-2.5">
                                <span
                                  style={{
                                    backgroundColor: catTheme.softBg,
                                    color: catTheme.text,
                                    borderColor: catTheme.softBorder,
                                  }}
                                  className="hidden sm:inline-flex font-mono-tabular text-xs font-bold min-w-[28px] h-[26px] px-2 items-center justify-center rounded-md border shrink-0 mt-0.5"
                                >
                                  {parent.displayCode}
                                </span>
                                <span className="text-[15.5px] sm:text-base font-semibold text-huyen-lam group-hover:text-lam-sang-ink group-hover:underline leading-[1.4] break-words">
                                  {parent.title}
                                </span>
                              </div>
                            </button>

                            {/* Tablet (sm..md) StatusBadge */}
                            <div className="hidden sm:block lg:hidden shrink-0 pt-0.5">
                              <StatusBadge status={parent.status} compact />
                            </div>
                          </div>

                          {/* Unified Parent Metadata Line */}
                          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs leading-5">
                            <span
                              style={{ color: catTheme.text }}
                              className="inline-flex items-center gap-1.5 font-medium"
                            >
                              <span
                                className="w-2 h-2 rounded-[2px] shrink-0"
                                style={{ backgroundColor: catTheme.accent }}
                                aria-hidden="true"
                              />
                              <span>
                                {effCat.category || 'Chưa phân hạng mục'}
                              </span>
                            </span>

                            {totalChildrenInParent > 0 && (
                              <span className="inline-flex items-center gap-1.5 text-slate-600">
                                <ListChecks
                                  className="w-3.5 h-3.5 shrink-0"
                                  style={{
                                    color: isParentDone
                                      ? '#328578'
                                      : catTheme.accent,
                                  }}
                                />
                                <span
                                  className={`font-mono-tabular font-semibold ${
                                    isParentDone
                                      ? 'text-thanh-ngoc-ink'
                                      : 'text-huyen-lam'
                                  }`}
                                >
                                  {progress.completed}/{progress.total}
                                </span>
                                <span
                                  aria-hidden="true"
                                  className="w-10 h-1.5 rounded-full bg-slate-200 overflow-hidden inline-block"
                                >
                                  <span
                                    className="block h-full rounded-full transition-all"
                                    style={{
                                      width: `${progress.percentage}%`,
                                      backgroundColor: isParentDone
                                        ? '#328578'
                                        : catTheme.accent,
                                    }}
                                  />
                                </span>
                              </span>
                            )}

                            {parentDriveNode}

                            {parent.reviewFlags.length > 0 && (
                              <span className="inline-flex items-center gap-1.5 font-medium text-minh-kim-ink">
                                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                <span>Cần rà soát</span>
                              </span>
                            )}

                            {parent.archivedAt && (
                              <span className="inline-flex items-center gap-1.5 text-slate-500">
                                <Archive className="w-3.5 h-3.5 shrink-0" />
                                <span>Đã lưu trữ</span>
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Desktop Column 2: Status */}
                      <div className="hidden lg:flex items-center">
                        <StatusBadge
                          status={parent.status}
                          compact
                          className="min-w-[110px]"
                        />
                      </div>

                      {/* Desktop Column 3: Assignees */}
                      <div className="hidden lg:block min-w-0">
                        {renderAssigneeCell(parent)}
                      </div>

                      {/* Desktop Column 4: Next Step */}
                      <div
                        className="hidden lg:block min-w-0 text-[13px] leading-snug"
                        title={parent.nextStep ?? ''}
                      >
                        {parent.nextStep ? (
                          <span className="line-clamp-2 break-words text-slate-600">
                            {parent.nextStep}
                          </span>
                        ) : (
                          <span className="text-slate-300 select-none">—</span>
                        )}
                      </div>

                      {/* Desktop Column 5: Due Date */}
                      <div className="hidden lg:block">
                        {renderDueDateCell(parent, true)}
                      </div>
                    </div>

                    {/* Mobile (< lg) Parent Meta */}
                    <div
                      className={`lg:hidden mt-2.5 pt-2 border-t border-slate-100 space-y-1.5 ${
                        hasChildren ? 'pl-11' : ''
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                        <div className="min-w-0 flex-1">
                          {renderAssigneeCell(parent)}
                        </div>
                        {parent.dueDate && (
                          <div className="shrink-0 text-xs text-slate-500 flex items-center gap-1">
                            <span>Hạn:</span>
                            {renderDueDateCell(parent, false)}
                          </div>
                        )}
                      </div>
                      {parent.nextStep && (
                        <div className="text-[13px] text-slate-600 leading-snug break-words">
                          <span className="text-slate-400 font-medium">
                            Tiếp theo:{' '}
                          </span>
                          {parent.nextStep}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Nested Child Rows (Light, Airy, Minimal Borders) */}
                  {isExpanded && (
                    <div className="border-t border-slate-200/75 bg-slate-50/70 divide-y divide-slate-200/55">
                      {children.map((child) => {
                        const childDriveNode = renderDriveLinkAction(child);

                        return (
                          <div
                            key={child.id}
                            onClick={() => onSelectTask(child.id)}
                            className="px-3 py-2.5 sm:px-4 sm:py-3 hover:bg-white/90 transition-colors cursor-pointer"
                          >
                            <div className={DESKTOP_GRID_COLS}>
                              {/* Column 1: Indented Tree Connector + Clean Code + Readable Child Title */}
                              <div className="flex items-start gap-2.5 min-w-0">
                                <div className="shrink-0 w-9 sm:w-12 flex items-start justify-end pr-0.5 pt-1">
                                  <CornerDownRight
                                    className="w-3.5 h-3.5 shrink-0 opacity-65"
                                    style={{ color: catTheme.accent }}
                                    aria-hidden="true"
                                  />
                                </div>

                                <div className="flex-1 min-w-0">
                                  {/* Mobile (< sm) Top Strip: Child Code + Status */}
                                  <div className="flex sm:hidden items-center justify-between gap-2 mb-1">
                                    <span
                                      style={{ color: catTheme.text }}
                                      className="font-mono-tabular text-xs font-semibold shrink-0"
                                    >
                                      {child.displayCode}
                                    </span>
                                    <StatusBadge status={child.status} compact />
                                  </div>

                                  <div className="flex items-start justify-between gap-2.5">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onSelectTask(child.id);
                                      }}
                                      className="text-left flex-1 min-w-0 group focus-visible:outline-2 focus-visible:outline-lam-sang rounded-sm"
                                    >
                                      <div className="flex items-baseline gap-2">
                                        <span
                                          style={{ color: catTheme.text }}
                                          className="hidden sm:inline-block font-mono-tabular text-xs font-semibold shrink-0"
                                        >
                                          {child.displayCode}
                                        </span>
                                        <span className="text-sm font-medium text-slate-800 group-hover:text-lam-sang-ink group-hover:underline leading-[1.42] break-words">
                                          {child.title}
                                        </span>
                                      </div>
                                    </button>

                                    {/* Tablet (sm..md) StatusBadge */}
                                    <div className="hidden sm:block lg:hidden shrink-0 pt-0.5">
                                      <StatusBadge status={child.status} compact />
                                    </div>
                                  </div>

                                  {(childDriveNode ||
                                    child.reviewFlags.length > 0 ||
                                    child.archivedAt) && (
                                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs leading-5">
                                      {childDriveNode}
                                      {child.reviewFlags.length > 0 && (
                                        <span className="inline-flex items-center gap-1.5 font-medium text-minh-kim-ink">
                                          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                          <span>Cần rà soát</span>
                                        </span>
                                      )}
                                      {child.archivedAt && (
                                        <span className="inline-flex items-center gap-1.5 text-slate-500">
                                          <Archive className="w-3.5 h-3.5 shrink-0" />
                                          <span>Đã lưu trữ</span>
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Desktop Column 2: Child Status */}
                              <div className="hidden lg:flex items-center">
                                <StatusBadge
                                  status={child.status}
                                  compact
                                  className="min-w-[110px]"
                                />
                              </div>

                              {/* Desktop Column 3: Child Assignees */}
                              <div className="hidden lg:block min-w-0">
                                {renderAssigneeCell(child)}
                              </div>

                              {/* Desktop Column 4: Child Next Step */}
                              <div
                                className="hidden lg:block min-w-0 text-[13px] leading-snug"
                                title={child.nextStep ?? ''}
                              >
                                {child.nextStep ? (
                                  <span className="line-clamp-2 break-words text-slate-600">
                                    {child.nextStep}
                                  </span>
                                ) : (
                                  <span className="text-slate-300 select-none">
                                    —
                                  </span>
                                )}
                              </div>

                              {/* Desktop Column 5: Child Due Date */}
                              <div className="hidden lg:block">
                                {renderDueDateCell(child, true)}
                              </div>
                            </div>

                            {/* Mobile (< lg) Child Meta */}
                            <div className="lg:hidden pl-11 sm:pl-14 mt-1.5 space-y-1">
                              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5">
                                <div className="min-w-0 flex-1">
                                  {renderAssigneeCell(child)}
                                </div>
                                {child.dueDate && (
                                  <div className="shrink-0 text-xs text-slate-500 flex items-center gap-1">
                                    <span>Hạn:</span>
                                    {renderDueDateCell(child, false)}
                                  </div>
                                )}
                              </div>
                              {child.nextStep && (
                                <div className="text-[13px] text-slate-600 leading-snug break-words">
                                  <span className="text-slate-400 font-medium">
                                    Tiếp theo:{' '}
                                  </span>
                                  {child.nextStep}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer Summary & Archive Toggle */}
      <div className="pt-1 flex flex-wrap items-center justify-between gap-2 text-xs sm:text-[13px] text-slate-500">
        <span className="tabular-nums">
          Hiển thị{' '}
          <strong className="font-semibold text-huyen-lam">
            {filteredTree.length}
          </strong>{' '}
          nhóm việc cha
          {visibleChildCount > 0 ? ` và ${visibleChildCount} việc con đang mở` : ''}
        </span>
        <button
          type="button"
          onClick={() => setShowArchived((v) => !v)}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-slate-600 hover:text-huyen-lam hover:bg-slate-100 transition-colors min-h-[40px]"
        >
          <Archive className="w-3.5 h-3.5 shrink-0" />
          <span>
            {showArchived ? 'Ẩn việc đã lưu trữ' : 'Xem việc đã lưu trữ'}
          </span>
        </button>
      </div>
    </div>
  );
};
