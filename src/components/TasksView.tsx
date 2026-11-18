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

const DESKTOP_GRID_COLS =
  'lg:grid lg:grid-cols-[minmax(0,1fr)_132px_168px_192px_94px] lg:items-center lg:gap-4';

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
        <span className="text-xs font-medium text-minh-kim-ink">
          Chưa phân công
        </span>
      );
    }

    return (
      <div className="min-w-0">
        <div className="text-xs font-medium text-huyen-lam leading-snug break-words">
          {task.assignees.length > 0 ? task.assignees.join(', ') : 'Đã gán tài khoản'}
        </div>
        {task.assignees.length > 0 && task.assigneeUids.length === 0 && (
          <div className="text-[11px] text-ink-muted/75 leading-tight mt-0.5">
            Chưa gắn tài khoản
          </div>
        )}
      </div>
    );
  };

  const renderDueDateCell = (task: TaskItem, alignRight: boolean) => {
    if (!task.dueDate) {
      return (
        <span
          className={`text-xs font-mono-tabular text-ink-muted/50 ${
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
        className={`text-xs font-mono-tabular whitespace-nowrap ${
          alignRight ? 'block text-right' : ''
        } ${overdue ? 'text-chu-sa font-semibold' : 'text-huyen-lam/85'}`}
        title={overdue ? 'Quá hạn xử lý' : undefined}
      >
        {formatShortDate(task.dueDate)}
      </span>
    );
  };

  const renderDriveLinksTrigger = (task: TaskItem) => {
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
        className="inline-flex items-center gap-1 text-[11px] font-medium text-lam-tri-tue hover:text-huyen-lam hover:underline whitespace-nowrap shrink-0 py-0.5"
      >
        <ExternalLink className="w-3 h-3 shrink-0" />
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
            <h1 className="text-lg sm:text-2xl font-bold text-huyen-lam tracking-tight">
              Danh sách công việc
            </h1>
            <span className="h-[3px] w-6 rounded-full bg-chu-sa/85 hidden sm:inline-block" aria-hidden="true" />
          </div>
          <p className="text-xs sm:text-sm text-ink-muted mt-0.5 tabular-nums">
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
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-nga-xam bg-white text-huyen-lam text-xs font-medium hover:bg-surface-muted transition-colors whitespace-nowrap min-h-[42px]"
            >
              {allExpanded ? (
                <>
                  <ChevronsDownUp className="w-3.5 h-3.5 shrink-0 text-ink-muted" />
                  <span>Thu gọn việc con</span>
                </>
              ) : (
                <>
                  <ChevronsUpDown className="w-3.5 h-3.5 shrink-0 text-minh-kim-ink" />
                  <span>Mở tất cả việc con</span>
                </>
              )}
            </button>
          )}

          {canCreate && (
            <button
              type="button"
              onClick={() => onOpenNewTask(null)}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-huyen-lam text-nga-thien text-sm font-semibold hover:bg-lam-tri-tue transition-colors whitespace-nowrap shrink-0 min-h-[42px]"
            >
              <Plus className="w-4 h-4 shrink-0 text-kim-quang" />
              <span>{isManager ? 'Thêm đầu việc' : 'Thêm việc con'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="bg-white border border-nga-xam rounded-xl p-3 sm:p-3.5 space-y-2.5 shadow-[0_1px_2px_rgba(20,36,63,0.03)]">
        {/* Tier 1: Search Input + Live Count + Reset */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <Search className="w-4 h-4 text-ink-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm theo mã, tên việc, người phụ trách, bước tiếp theo..."
              aria-label="Tìm kiếm công việc"
              className="w-full pl-9 pr-10 py-2 text-sm bg-nga-thien/75 border border-nga-xam rounded-lg text-huyen-lam placeholder:text-ink-muted/75 focus:outline-none focus:ring-2 focus:ring-lam-tri-tue focus:bg-white min-h-[42px]"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Xóa từ khóa tìm kiếm"
                className="absolute right-1 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center rounded-md text-ink-muted hover:text-huyen-lam hover:bg-surface-muted transition-colors"
              >
                <X className="w-4 h-4 shrink-0" />
              </button>
            )}
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0">
            <div className="text-xs text-ink-muted tabular-nums whitespace-nowrap px-1">
              Đang xem{' '}
              <span
                className={`font-mono-tabular font-semibold ${
                  hasActiveFilter ? 'text-minh-kim-ink' : 'text-huyen-lam'
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

        {/* Tier 2: Structured Filter Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          <select
            aria-label="Lọc theo trạng thái"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className={`w-full px-3 py-2 text-xs sm:text-sm rounded-lg border focus:outline-none focus:ring-2 focus:ring-lam-tri-tue min-h-[42px] transition-colors ${
              statusFilter !== 'all'
                ? 'bg-minh-kim-soft/70 border-minh-kim-border text-huyen-lam font-medium'
                : 'bg-white border-nga-xam text-huyen-lam'
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
            className={`w-full px-3 py-2 text-xs sm:text-sm rounded-lg border focus:outline-none focus:ring-2 focus:ring-lam-tri-tue min-h-[42px] transition-colors ${
              categoryFilter !== 'all'
                ? 'bg-minh-kim-soft/70 border-minh-kim-border text-huyen-lam font-medium'
                : 'bg-white border-nga-xam text-huyen-lam'
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
            className={`w-full px-3 py-2 text-xs sm:text-sm rounded-lg border focus:outline-none focus:ring-2 focus:ring-lam-tri-tue min-h-[42px] transition-colors ${
              assigneeFilter !== 'all'
                ? 'bg-minh-kim-soft/70 border-minh-kim-border text-huyen-lam font-medium'
                : 'bg-white border-nga-xam text-huyen-lam'
            }`}
          >
            <option value="all">Tất cả người phụ trách</option>
            <option value="__unassigned__">Chưa phân công</option>
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
            className={`w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs sm:text-sm font-medium rounded-lg border transition-colors min-h-[42px] whitespace-nowrap ${
              reviewOnly
                ? 'bg-huyen-lam border-huyen-lam text-kim-quang font-semibold'
                : 'bg-white border-nga-xam text-huyen-lam hover:bg-nga-thien'
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

      {/* Desktop Column Header Bar (Huyền Lam + Kim Quang + Minh Kim rule) */}
      {filteredTree.length > 0 && (
        <div
          className={`hidden ${DESKTOP_GRID_COLS} px-4 py-2.5 bg-huyen-lam text-nga-thien rounded-xl border border-huyen-lam-deep border-b-2 border-b-minh-kim text-xs font-semibold tracking-[0.01em]`}
        >
          <div className="pl-11">Mã · Đầu việc &amp; Hạng mục</div>
          <div className="text-kim-quang">Trạng thái</div>
          <div>Người phụ trách</div>
          <div>Bước tiếp theo</div>
          <div className="text-right">Hạn xử lý</div>
        </div>
      )}

      {/* Card–Table Hybrid List */}
      <div className="space-y-2.5">
        {filteredTree.length === 0 ? (
          <div className="bg-white border border-nga-xam rounded-xl px-4 py-10 text-center space-y-3">
            <p className="text-sm text-ink-muted">
              {tasks.filter((t) => !isB1TestTask(t)).length === 0
                ? 'Chưa có công việc nào trên hệ thống.'
                : 'Không tìm thấy công việc nào khớp với điều kiện lọc hiện tại.'}
            </p>
            {hasActiveFilter && (
              <button
                type="button"
                onClick={resetFilters}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-huyen-lam text-nga-thien rounded-lg hover:bg-lam-tri-tue transition-colors min-h-[42px]"
              >
                <RotateCcw className="w-4 h-4 shrink-0 text-kim-quang" />
                <span>Đặt lại toàn bộ bộ lọc</span>
              </button>
            )}
          </div>
        ) : (
          filteredTree.map(({ parent, children, autoExpand }) => {
            const totalChildrenInParent =
              (childrenByParent[parent.id] || []).length;
            const hasChildren = children.length > 0;
            const isExpanded =
              hasChildren && (autoExpand || Boolean(expandedParents[parent.id]));
            const progress = computeParentProgress(parent.id, visiblePool);
            const effCat = getEffectiveCategory(parent, visiblePool, categories);
            const catAccentColor = effCat.color || '#14243F';
            const parentDriveNode = renderDriveLinksTrigger(parent);

            return (
              <section
                key={parent.id}
                aria-label={`Nhóm công việc ${parent.displayCode}: ${parent.title}`}
                className="bg-white border border-nga-xam rounded-xl overflow-hidden shadow-[0_1px_2px_rgba(20,36,63,0.04)]"
              >
                {/* Category Identity Hairline Accent */}
                <div
                  className="h-[3px] w-full"
                  style={{ backgroundColor: catAccentColor }}
                  aria-hidden="true"
                />

                {/* Parent Row */}
                <div
                  onClick={() => onSelectTask(parent.id)}
                  className="px-3 py-3 sm:px-4 sm:py-3.5 bg-white hover:bg-nga-thien/70 transition-colors cursor-pointer"
                >
                  <div className={DESKTOP_GRID_COLS}>
                    {/* Column 1: Expand Toggle + Parent Code + Title + Quiet Sub-meta */}
                    <div className="flex items-start gap-2 min-w-0">
                      <div className="shrink-0 w-9 flex items-start justify-center pt-0.5">
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
                            className="w-10 h-10 -my-1.5 flex items-center justify-center rounded-lg text-huyen-lam/75 hover:bg-surface-muted hover:text-huyen-lam transition-colors"
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
                            className="w-9 h-6 inline-flex items-center justify-center text-nga-xam"
                          >
                            ·
                          </span>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        {/* Mobile Top Strip: Code + Status side-by-side so Title gets full width below */}
                        <div className="flex sm:hidden items-center justify-between gap-2 mb-1">
                          <span className="font-mono-tabular text-xs font-bold px-2 py-0.5 rounded-[5px] bg-huyen-lam text-kim-quang shrink-0 leading-5">
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
                            className="text-left flex-1 min-w-0 group focus-visible:outline-2 focus-visible:outline-lam-tri-tue rounded-sm"
                          >
                            <div className="flex items-start gap-2">
                              <span className="hidden sm:inline-block font-mono-tabular text-xs font-bold px-2 py-0.5 rounded-[5px] bg-huyen-lam text-kim-quang shrink-0 mt-0.5 leading-5">
                                {parent.displayCode}
                              </span>
                              <span className="text-[14.5px] sm:text-[15px] font-semibold text-huyen-lam group-hover:text-lam-tri-tue group-hover:underline leading-snug break-words">
                                {parent.title}
                              </span>
                            </div>
                          </button>

                          {/* Tablet Status Badge (sm..md) */}
                          <div className="hidden sm:block lg:hidden shrink-0 pt-0.5">
                            <StatusBadge status={parent.status} compact />
                          </div>
                        </div>

                        {/* Priority #6 Meta Strip: Category · Subtask Progress · Drive Link · Subtle Review */}
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-ink-muted">
                          <span className="inline-flex items-center gap-1.5">
                            <span
                              className="w-2 h-2 rounded-[2px] shrink-0"
                              style={{ backgroundColor: catAccentColor }}
                              aria-hidden="true"
                            />
                            <span className="text-huyen-lam/80 font-medium">
                              {effCat.category || 'Chưa phân hạng mục'}
                            </span>
                          </span>

                          {totalChildrenInParent > 0 && (
                            <>
                              <span aria-hidden="true" className="text-nga-xam">
                                ·
                              </span>
                              <span className="inline-flex items-center gap-1.5">
                                <span
                                  className={`font-mono-tabular font-semibold ${
                                    progress.completed === progress.total &&
                                    progress.total > 0
                                      ? 'text-emerald-800'
                                      : 'text-minh-kim-ink'
                                  }`}
                                >
                                  Tiến độ con: {progress.completed}/{progress.total}
                                </span>
                                <span
                                  aria-hidden="true"
                                  className="w-10 h-1.5 rounded-full bg-nga-xam overflow-hidden inline-block"
                                >
                                  <span
                                    className={`block h-full rounded-full ${
                                      progress.completed === progress.total &&
                                      progress.total > 0
                                        ? 'bg-emerald-600'
                                        : 'bg-minh-kim'
                                    }`}
                                    style={{ width: `${progress.percentage}%` }}
                                  />
                                </span>
                              </span>
                            </>
                          )}

                          {parentDriveNode && (
                            <>
                              <span aria-hidden="true" className="text-nga-xam">
                                ·
                              </span>
                              {parentDriveNode}
                            </>
                          )}

                          {parent.reviewFlags.length > 0 && (
                            <>
                              <span aria-hidden="true" className="text-nga-xam">
                                ·
                              </span>
                              <span className="inline-flex items-center gap-1 text-[11px] text-minh-kim-ink">
                                <AlertCircle className="w-3 h-3 shrink-0" />
                                <span>Cần rà soát</span>
                              </span>
                            </>
                          )}

                          {parent.archivedAt && (
                            <>
                              <span aria-hidden="true" className="text-nga-xam">
                                ·
                              </span>
                              <span className="inline-flex items-center gap-1 text-[11px] text-ink-muted">
                                <Archive className="w-3 h-3 shrink-0" />
                                <span>Đã lưu trữ</span>
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Desktop Column 2: Status */}
                    <div className="hidden lg:flex items-center">
                      <StatusBadge
                        status={parent.status}
                        compact
                        className="min-w-[108px]"
                      />
                    </div>

                    {/* Desktop Column 3: Assignees */}
                    <div className="hidden lg:block min-w-0">
                      {renderAssigneeCell(parent)}
                    </div>

                    {/* Desktop Column 4: Next Step */}
                    <div
                      className="hidden lg:block min-w-0 text-xs text-ink-muted leading-snug"
                      title={parent.nextStep ?? ''}
                    >
                      {parent.nextStep ? (
                        <span className="line-clamp-2 break-words text-slate-700">
                          {parent.nextStep}
                        </span>
                      ) : (
                        <span className="text-ink-muted/45">—</span>
                      )}
                    </div>

                    {/* Desktop Column 5: Due Date */}
                    <div className="hidden lg:block">
                      {renderDueDateCell(parent, true)}
                    </div>
                  </div>

                  {/* Mobile Compact Metadata Grid (< lg, tuned for 375px) */}
                  <div className="lg:hidden pl-11 mt-2 pt-2 border-t border-nga-xam/60 space-y-1.5">
                    <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                      <div className="min-w-0 flex-1">
                        {renderAssigneeCell(parent)}
                      </div>
                      {parent.dueDate && (
                        <div className="shrink-0 text-xs text-ink-muted flex items-center gap-1">
                          <span>Hạn:</span>
                          {renderDueDateCell(parent, false)}
                        </div>
                      )}
                    </div>
                    {parent.nextStep && (
                      <div className="text-xs text-slate-700 leading-snug break-words">
                        <span className="text-ink-muted font-medium">
                          Tiếp theo:{' '}
                        </span>
                        {parent.nextStep}
                      </div>
                    )}
                  </div>
                </div>

                {/* Nested Child Rows (Compact Alternating Table Rows) */}
                {isExpanded && (
                  <div className="border-t border-nga-xam divide-y divide-nga-xam/70">
                    {children.map((child, idx) => {
                      const childDriveNode = renderDriveLinksTrigger(child);
                      const rowSurface =
                        idx % 2 === 0
                          ? 'bg-nga-thien/75'
                          : 'bg-surface-muted/45';

                      return (
                        <div
                          key={child.id}
                          onClick={() => onSelectTask(child.id)}
                          className={`px-3 py-2.5 sm:px-4 sm:py-3 ${rowSurface} hover:bg-minh-kim-soft/45 transition-colors cursor-pointer`}
                        >
                          <div className={DESKTOP_GRID_COLS}>
                            {/* Column 1: Tree Indentation + Child Code + Title */}
                            <div className="flex items-start gap-2 min-w-0">
                              <div className="shrink-0 w-9 sm:w-12 flex items-start justify-end pr-0.5 pt-1">
                                <CornerDownRight
                                  className="w-3.5 h-3.5 text-minh-kim-ink/70 shrink-0"
                                  aria-hidden="true"
                                />
                              </div>

                              <div className="flex-1 min-w-0">
                                {/* Mobile Child Top Strip: Child Code + Status */}
                                <div className="flex sm:hidden items-center justify-between gap-2 mb-1">
                                  <span className="font-mono-tabular text-[11px] font-semibold px-1.5 py-0.5 rounded bg-minh-kim-soft border border-minh-kim-border/80 text-minh-kim-ink shrink-0 leading-4">
                                    {child.displayCode}
                                  </span>
                                  <StatusBadge status={child.status} compact />
                                </div>

                                <div className="flex items-start justify-between gap-2">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onSelectTask(child.id);
                                    }}
                                    className="text-left flex-1 min-w-0 group focus-visible:outline-2 focus-visible:outline-lam-tri-tue rounded-sm"
                                  >
                                    <div className="flex items-start gap-2">
                                      <span className="hidden sm:inline-block font-mono-tabular text-[11px] font-semibold px-1.5 py-0.5 rounded bg-minh-kim-soft border border-minh-kim-border/80 text-minh-kim-ink shrink-0 mt-0.5 leading-4">
                                        {child.displayCode}
                                      </span>
                                      <span className="text-[13.5px] sm:text-sm font-medium text-huyen-lam group-hover:text-lam-tri-tue group-hover:underline leading-snug break-words">
                                        {child.title}
                                      </span>
                                    </div>
                                  </button>

                                  {/* Tablet Child Status Badge (sm..md) */}
                                  <div className="hidden sm:block lg:hidden shrink-0 pt-0.5">
                                    <StatusBadge status={child.status} compact />
                                  </div>
                                </div>

                                {(childDriveNode ||
                                  child.reviewFlags.length > 0 ||
                                  child.archivedAt) && (
                                  <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px]">
                                    {childDriveNode}
                                    {childDriveNode &&
                                      (child.reviewFlags.length > 0 ||
                                        child.archivedAt) && (
                                        <span
                                          aria-hidden="true"
                                          className="text-nga-xam"
                                        >
                                          ·
                                        </span>
                                      )}
                                    {child.reviewFlags.length > 0 && (
                                      <span className="inline-flex items-center gap-1 text-minh-kim-ink">
                                        <AlertCircle className="w-3 h-3 shrink-0" />
                                        <span>Cần rà soát</span>
                                      </span>
                                    )}
                                    {child.archivedAt && (
                                      <span className="inline-flex items-center gap-1 text-ink-muted">
                                        <Archive className="w-3 h-3 shrink-0" />
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
                                className="min-w-[108px]"
                              />
                            </div>

                            {/* Desktop Column 3: Child Assignees */}
                            <div className="hidden lg:block min-w-0">
                              {renderAssigneeCell(child)}
                            </div>

                            {/* Desktop Column 4: Child Next Step */}
                            <div
                              className="hidden lg:block min-w-0 text-xs text-ink-muted leading-snug"
                              title={child.nextStep ?? ''}
                            >
                              {child.nextStep ? (
                                <span className="line-clamp-2 break-words text-slate-700">
                                  {child.nextStep}
                                </span>
                              ) : (
                                <span className="text-ink-muted/45">—</span>
                              )}
                            </div>

                            {/* Desktop Column 5: Child Due Date */}
                            <div className="hidden lg:block">
                              {renderDueDateCell(child, true)}
                            </div>
                          </div>

                          {/* Mobile Child Compact Meta (< lg) */}
                          <div className="lg:hidden pl-11 sm:pl-14 mt-1.5 space-y-1">
                            <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-0.5">
                              <div className="min-w-0 flex-1">
                                {renderAssigneeCell(child)}
                              </div>
                              {child.dueDate && (
                                <div className="shrink-0 text-[11px] text-ink-muted flex items-center gap-1">
                                  <span>Hạn:</span>
                                  {renderDueDateCell(child, false)}
                                </div>
                              )}
                            </div>
                            {child.nextStep && (
                              <div className="text-[11px] text-slate-700 leading-snug break-words">
                                <span className="text-ink-muted font-medium">
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
          })
        )}
      </div>

      {/* Footer Summary & Archive Toggle */}
      <div className="pt-1 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-muted">
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
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-huyen-lam/80 hover:text-huyen-lam hover:bg-surface-muted transition-colors min-h-[40px]"
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
