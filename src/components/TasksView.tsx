import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Archive,
  ArrowUp,
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
  SlidersHorizontal,
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
      text: '#23527A',
      softBg: '#F1F6FB',
      softBorder: '#D2E2F0',
    };
  }
  if (categoryId === 'cat_foundation' || nameKey.includes('nền tảng')) {
    return {
      accent: '#328578',
      text: '#1D5950',
      softBg: '#EFF7F5',
      softBorder: '#C9E2DD',
    };
  }
  if (categoryId === 'cat_research' || nameKey.includes('truy nguồn')) {
    return {
      accent: '#C9A14B',
      text: '#7A5410',
      softBg: '#FCF7EA',
      softBorder: '#E7D5A7',
    };
  }
  return {
    accent: fallbackColor || '#477FAE',
    text: '#14243F',
    softBg: '#F5F2EA',
    softBorder: '#E2DCCE',
  };
}

const DESKTOP_GRID_COLS =
  'lg:grid lg:grid-cols-[minmax(0,2.35fr)_122px_minmax(0,1fr)_minmax(0,1.1fr)_90px] xl:grid-cols-[minmax(0,1fr)_136px_174px_206px_98px] lg:items-center lg:gap-3 xl:gap-4';

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

  const filterBarRef = useRef<HTMLDivElement | null>(null);
  const columnHeaderRef = useRef<HTMLDivElement | null>(null);
  const stickyPopoverRef = useRef<HTMLDivElement | null>(null);
  const [showStickyBar, setShowStickyBar] = useState(false);
  const [showStickyColumnHeader, setShowStickyColumnHeader] = useState(false);
  const [stickyFilterOpen, setStickyFilterOpen] = useState(false);

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

  useEffect(() => {
    let rafId = 0;

    const evaluateStickyState = () => {
      rafId = 0;
      const filterEl = filterBarRef.current;
      if (!filterEl || window.scrollY < 40) {
        setShowStickyBar(false);
        setShowStickyColumnHeader(false);
        return;
      }

      const filterBottom = filterEl.getBoundingClientRect().bottom;
      setShowStickyBar((prev) => {
        if (!prev && filterBottom <= 56) return true;
        if (prev && filterBottom > 66) return false;
        return prev;
      });

      const isDesktop = window.innerWidth >= 1024;
      const headerEl = columnHeaderRef.current;
      if (!isDesktop || !headerEl) {
        setShowStickyColumnHeader(false);
        return;
      }
      const headerTop = headerEl.getBoundingClientRect().top;
      setShowStickyColumnHeader((prev) => {
        if (filterBottom > 66) return false;
        if (!prev && headerTop <= 104) return true;
        if (prev && headerTop > 114) return false;
        return prev;
      });
    };

    const handleScrollOrResize = () => {
      if (!rafId) {
        rafId = window.requestAnimationFrame(evaluateStickyState);
      }
    };

    evaluateStickyState();
    window.addEventListener('scroll', handleScrollOrResize, { passive: true });
    window.addEventListener('resize', handleScrollOrResize, { passive: true });
    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      window.removeEventListener('scroll', handleScrollOrResize);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [filteredTree.length]);

  useEffect(() => {
    if (!showStickyBar) {
      setStickyFilterOpen(false);
    }
  }, [showStickyBar]);

  useEffect(() => {
    if (!stickyFilterOpen) return;
    const handlePointerDown = (e: PointerEvent) => {
      if (
        stickyPopoverRef.current &&
        !stickyPopoverRef.current.contains(e.target as Node)
      ) {
        setStickyFilterOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setStickyFilterOpen(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [stickyFilterOpen]);

  const scrollToTop = () => {
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: prefersReduced ? 'auto' : 'smooth' });
  };

  const activeFilterChips = useMemo(() => {
    const chips: Array<{
      key: string;
      label: string;
      toneClass: string;
      onRemove: () => void;
    }> = [];

    if (statusFilter !== 'all') {
      chips.push({
        key: 'status',
        label:
          statusFilter === '__unset__'
            ? 'TT: Cần rà soát'
            : `TT: ${statusFilter}`,
        toneClass:
          'bg-lam-sang-soft border-lam-sang/40 text-lam-sang-ink hover:bg-lam-sang/15',
        onRemove: () => setStatusFilter('all'),
      });
    }

    if (categoryFilter !== 'all') {
      const catLabel =
        categoryFilter === '__uncategorized__'
          ? 'Chưa phân hạng mục'
          : categories.find((c) => c.id === categoryFilter)?.name ??
            categoryFilter;
      chips.push({
        key: 'category',
        label: `HM: ${catLabel}`,
        toneClass:
          'bg-thanh-ngoc-soft border-thanh-ngoc/40 text-thanh-ngoc-ink hover:bg-thanh-ngoc/15',
        onRemove: () => setCategoryFilter('all'),
      });
    }

    if (assigneeFilter !== 'all') {
      const assigneeLabel =
        assigneeFilter === '__unassigned__'
          ? 'Chưa phân công'
          : assigneeFilter === '__unlinked_uid__'
          ? 'Chưa gắn TK'
          : assigneeFilter;
      chips.push({
        key: 'assignee',
        label: `PT: ${assigneeLabel}`,
        toneClass:
          'bg-minh-kim-soft border-minh-kim-border text-minh-kim-ink hover:bg-minh-kim/15',
        onRemove: () => setAssigneeFilter('all'),
      });
    }

    return chips;
  }, [statusFilter, categoryFilter, assigneeFilter, categories]);

  const activeDropdownFilterCount = activeFilterChips.length;

  const renderAssigneeCell = (task: TaskItem) => {
    if (task.assignees.length === 0 && task.assigneeUids.length === 0) {
      return (
        <span className="text-[12.5px] text-[#8E96A3]">
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
            className="inline-flex items-center text-[#BEB6A7] hover:text-huyen-lam transition-colors shrink-0"
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
          className={`text-[13px] font-mono-tabular text-[#D6D0C4] select-none ${
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
        className={`text-[12.5px] font-mono-tabular whitespace-nowrap ${
          alignRight ? 'block text-right' : ''
        } ${
          overdue ? 'text-chu-sa font-semibold' : 'text-[#525F73]'
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
        className="inline-flex items-center gap-1 text-xs font-medium text-lam-sang-ink hover:text-huyen-lam hover:underline decoration-lam-sang/50 underline-offset-2 whitespace-nowrap shrink-0 transition-colors"
      >
        <ExternalLink className="w-3 h-3 shrink-0 opacity-85" />
        <span>
          {validLinks.length > 1
            ? `${validLinks.length} tài liệu KQ`
            : 'Tài liệu KQ'}
        </span>
      </a>
    );
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Sticky Compact Toolbar + Desktop Sticky Column Header (activates on scroll past main filter) */}
      <div
        aria-hidden={!showStickyBar}
        className={`fixed top-[52px] left-0 lg:left-60 right-0 z-20 transition-[opacity,transform] duration-200 ease-out ${
          showStickyBar
            ? 'opacity-100 translate-y-0 pointer-events-auto visible'
            : 'opacity-0 -translate-y-2 pointer-events-none invisible'
        }`}
      >
        <div
          ref={stickyPopoverRef}
          className="bg-trang-nga/95 backdrop-blur-md border-b border-[#E5DFD2] shadow-[0_6px_20px_-8px_rgba(20,36,63,0.1)]"
        >
          <div className="max-w-6xl mx-auto px-3 sm:px-6 relative">
            {/* Compact Toolbar Row: 48px mobile / 52px desktop */}
            <div className="h-[48px] lg:h-[52px] flex items-center gap-1 sm:gap-2">
              {/* 1. Compact Search */}
              <div className="relative flex-1 min-w-0 lg:flex-initial lg:w-56 xl:w-64">
                <Search className="w-3.5 h-3.5 text-[#8A94A3] absolute left-2 sm:left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  tabIndex={showStickyBar ? 0 : -1}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tìm mã, tên, phụ trách..."
                  aria-label="Tìm kiếm nhanh công việc"
                  className="w-full h-[36px] pl-7 pr-6 sm:pl-8 sm:pr-7 text-xs sm:text-[13px] bg-[#FAF8F3] border border-[#E2DCD0] rounded-lg text-huyen-lam placeholder:text-[#8E96A3] focus:outline-none focus:ring-2 focus:ring-lam-sang/30 focus:border-lam-sang focus:bg-white transition-colors"
                />
                {searchQuery && (
                  <button
                    type="button"
                    tabIndex={showStickyBar ? 0 : -1}
                    onClick={() => setSearchQuery('')}
                    aria-label="Xóa từ khóa tìm kiếm"
                    className="absolute right-0.5 top-1/2 -translate-y-1/2 w-6 h-6 sm:w-7 sm:h-7 flex items-center justify-center rounded text-[#7D8796] hover:text-huyen-lam"
                  >
                    <X className="w-3.5 h-3.5 shrink-0" />
                  </button>
                )}
              </div>

              {/* 2. Open Filter Popover Button */}
              <button
                type="button"
                tabIndex={showStickyBar ? 0 : -1}
                onClick={() => setStickyFilterOpen((v) => !v)}
                aria-expanded={stickyFilterOpen}
                aria-label="Mở bộ lọc nhanh"
                className={`inline-flex items-center justify-center gap-1 sm:gap-1.5 h-[36px] min-w-[36px] sm:min-w-[40px] px-2 sm:px-3 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                  stickyFilterOpen || activeDropdownFilterCount > 0
                    ? 'bg-lam-sang-soft border-lam-sang/45 text-lam-sang-ink font-semibold'
                    : 'bg-white border-[#E2DCD0] text-huyen-lam hover:bg-[#FAF8F3]'
                }`}
              >
                <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" />
                <span>Lọc</span>
                {activeDropdownFilterCount > 0 && (
                  <span className="font-mono-tabular text-[11px] font-bold px-1.5 py-0.5 rounded bg-lam-sang text-white leading-none">
                    {activeDropdownFilterCount}
                  </span>
                )}
              </button>

              {/* 3. Active Filter Chips (Desktop inline) */}
              {activeFilterChips.length > 0 && (
                <div className="hidden lg:flex flex-1 min-w-0 items-center gap-1.5 overflow-x-auto">
                  {activeFilterChips.map((chip) => (
                    <button
                      key={chip.key}
                      type="button"
                      tabIndex={showStickyBar ? 0 : -1}
                      onClick={chip.onRemove}
                      title={`Bỏ lọc: ${chip.label}`}
                      className={`inline-flex items-center gap-1 h-[30px] px-2 text-[11px] font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 max-w-[170px] ${chip.toneClass}`}
                    >
                      <span className="truncate">{chip.label}</span>
                      <X className="w-3 h-3 shrink-0" />
                    </button>
                  ))}
                  {hasActiveFilter && (
                    <button
                      type="button"
                      tabIndex={showStickyBar ? 0 : -1}
                      onClick={resetFilters}
                      className="inline-flex items-center gap-1 h-[30px] px-2 text-[11px] font-semibold text-chu-sa hover:bg-chu-sa-soft rounded-md transition-colors whitespace-nowrap shrink-0"
                    >
                      <RotateCcw className="w-3 h-3 shrink-0" />
                      <span>Xóa lọc</span>
                    </button>
                  )}
                </div>
              )}

              {/* Spacer on desktop when no chips */}
              {activeFilterChips.length === 0 && (
                <div className="hidden lg:block flex-1" />
              )}

              {/* 4. Cần rà soát toggle */}
              <button
                type="button"
                tabIndex={showStickyBar ? 0 : -1}
                onClick={() => setReviewOnly((v) => !v)}
                aria-pressed={reviewOnly}
                aria-label="Lọc việc cần rà soát"
                title={`Cần rà soát${reviewFlagCount > 0 ? ` (${reviewFlagCount})` : ''}`}
                className={`inline-flex items-center justify-center gap-1.5 h-[36px] w-9 sm:w-auto sm:min-w-[40px] px-0 sm:px-2.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                  reviewOnly
                    ? 'bg-huyen-lam border-huyen-lam text-kim-quang font-semibold'
                    : 'bg-white border-[#E2DCD0] text-huyen-lam hover:bg-[#FAF8F3]'
                }`}
              >
                <AlertCircle
                  className={`w-3.5 h-3.5 shrink-0 ${
                    reviewOnly ? 'text-kim-quang' : 'text-minh-kim-ink'
                  }`}
                />
                <span className="hidden sm:inline">Cần rà soát</span>
              </button>

              {/* 5. Expand / Collapse All */}
              {parentsWithVisibleChildren.length > 0 && !hasActiveFilter && (
                <button
                  type="button"
                  tabIndex={showStickyBar ? 0 : -1}
                  onClick={toggleExpandAll}
                  aria-label={
                    allExpanded ? 'Thu gọn việc con' : 'Mở tất cả việc con'
                  }
                  title={
                    allExpanded ? 'Thu gọn việc con' : 'Mở tất cả việc con'
                  }
                  className="inline-flex items-center justify-center gap-1.5 h-[36px] w-9 sm:w-auto sm:min-w-[40px] px-0 sm:px-2.5 text-xs font-medium rounded-lg border border-[#E2DCD0] bg-white text-huyen-lam hover:bg-[#FAF8F3] transition-colors whitespace-nowrap shrink-0"
                >
                  {allExpanded ? (
                    <>
                      <ChevronsDownUp className="w-3.5 h-3.5 shrink-0 text-[#667285]" />
                      <span className="hidden md:inline">Thu gọn</span>
                    </>
                  ) : (
                    <>
                      <ChevronsUpDown className="w-3.5 h-3.5 shrink-0 text-lam-sang" />
                      <span className="hidden md:inline">Mở con</span>
                    </>
                  )}
                </button>
              )}

              {/* 6. Visible Count */}
              <div
                className="font-mono-tabular text-[11px] sm:text-xs font-semibold text-huyen-lam px-0.5 sm:px-2 whitespace-nowrap shrink-0 tabular-nums"
                title={`Đang xem ${visibleTotalCount} trên ${visiblePool.length} công việc`}
              >
                <span className={hasActiveFilter ? 'text-lam-sang-ink' : ''}>
                  {visibleTotalCount}/{visiblePool.length}
                </span>
                <span className="hidden xl:inline text-[#6A7485] font-normal">
                  {' '}
                  việc
                </span>
              </div>

              {/* 7. Scroll to Top */}
              <button
                type="button"
                tabIndex={showStickyBar ? 0 : -1}
                onClick={scrollToTop}
                aria-label="Lên đầu trang"
                title="Lên đầu trang"
                className="inline-flex items-center justify-center gap-1 h-[36px] w-9 sm:w-auto sm:min-w-[40px] px-0 sm:px-2.5 text-xs font-medium rounded-lg bg-huyen-lam text-trang-nga hover:bg-lam-tri-tue transition-colors whitespace-nowrap shrink-0"
              >
                <ArrowUp className="w-3.5 h-3.5 shrink-0 text-kim-quang" />
                <span className="hidden xl:inline">Đầu trang</span>
              </button>
            </div>

            {/* Mobile/Tablet Active Filter Chips Strip (only rendered when dropdown filters active) */}
            {(activeFilterChips.length > 0 || (hasActiveFilter && searchQuery.trim() !== '')) && (
              <div className="lg:hidden flex items-center gap-1.5 pb-1.5 overflow-x-auto">
                {activeFilterChips.map((chip) => (
                  <button
                    key={chip.key}
                    type="button"
                    tabIndex={showStickyBar ? 0 : -1}
                    onClick={chip.onRemove}
                    className={`inline-flex items-center gap-1 h-[26px] px-2 text-[11px] font-medium rounded-md border whitespace-nowrap shrink-0 ${chip.toneClass}`}
                  >
                    <span>{chip.label}</span>
                    <X className="w-3 h-3 shrink-0" />
                  </button>
                ))}
                {hasActiveFilter && (
                  <button
                    type="button"
                    tabIndex={showStickyBar ? 0 : -1}
                    onClick={resetFilters}
                    className="inline-flex items-center gap-1 h-[26px] px-2 text-[11px] font-semibold text-chu-sa bg-chu-sa-soft border border-chu-sa-border rounded-md whitespace-nowrap shrink-0"
                  >
                    <RotateCcw className="w-3 h-3 shrink-0" />
                    <span>Xóa lọc</span>
                  </button>
                )}
              </div>
            )}

            {/* Quick Filter Popover anchored to sticky bar */}
            {stickyFilterOpen && (
              <div className="absolute left-3 right-3 sm:left-6 sm:right-auto sm:w-[460px] top-full mt-1.5 bg-trang-nga border border-[#DFD8C8] rounded-2xl shadow-[0_14px_34px_-10px_rgba(20,36,63,0.16)] p-4 space-y-3 z-30">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-huyen-lam">
                    Lọc nhanh danh sách
                  </span>
                  <button
                    type="button"
                    onClick={() => setStickyFilterOpen(false)}
                    aria-label="Đóng bộ lọc nhanh"
                    className="w-7 h-7 flex items-center justify-center rounded-md text-[#7D8796] hover:text-huyen-lam hover:bg-[#F3EFE6]"
                  >
                    <X className="w-4 h-4 shrink-0" />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[11px] font-medium text-[#606B7D] mb-1">
                      Trạng thái
                    </label>
                    <select
                      aria-label="Lọc nhanh theo trạng thái"
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      className="w-full px-2.5 py-2 text-xs rounded-lg border border-[#E2DCD0] bg-white text-huyen-lam focus:outline-none focus:ring-2 focus:ring-lam-sang/30 min-h-[38px]"
                    >
                      <option value="all">Tất cả</option>
                      {ALL_STATUSES.map((st) => (
                        <option key={st} value={st}>
                          {st}
                        </option>
                      ))}
                      <option value="__unset__">Chưa có trạng thái</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-[#606B7D] mb-1">
                      Hạng mục
                    </label>
                    <select
                      aria-label="Lọc nhanh theo hạng mục"
                      value={categoryFilter}
                      onChange={(e) => setCategoryFilter(e.target.value)}
                      className="w-full px-2.5 py-2 text-xs rounded-lg border border-[#E2DCD0] bg-white text-huyen-lam focus:outline-none focus:ring-2 focus:ring-lam-sang/30 min-h-[38px]"
                    >
                      <option value="all">Tất cả</option>
                      {sortedCategories.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name}
                        </option>
                      ))}
                      <option value="__uncategorized__">Chưa phân</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-[#606B7D] mb-1">
                      Phụ trách
                    </label>
                    <select
                      aria-label="Lọc nhanh theo người phụ trách"
                      value={assigneeFilter}
                      onChange={(e) => setAssigneeFilter(e.target.value)}
                      className="w-full px-2.5 py-2 text-xs rounded-lg border border-[#E2DCD0] bg-white text-huyen-lam focus:outline-none focus:ring-2 focus:ring-lam-sang/30 min-h-[38px]"
                    >
                      <option value="all">Tất cả</option>
                      <option value="__unassigned__">Chưa phân công</option>
                      {isManager && (
                        <option value="__unlinked_uid__">
                          Chưa gắn TK ({unlinkedUidCount})
                        </option>
                      )}
                      {assigneeOptions.map((person) => (
                        <option key={person} value={person}>
                          {person}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-[#EFEAE0]">
                  {hasActiveFilter ? (
                    <button
                      type="button"
                      onClick={resetFilters}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-chu-sa hover:underline"
                    >
                      <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                      <span>Xóa toàn bộ lọc</span>
                    </button>
                  ) : (
                    <span className="text-[11px] text-[#838C9A]">
                      Đang hiển thị toàn bộ danh sách
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => setStickyFilterOpen(false)}
                    className="px-3.5 py-1.5 text-xs font-semibold bg-huyen-lam text-trang-nga rounded-lg hover:bg-lam-tri-tue min-h-[34px]"
                  >
                    Xong
                  </button>
                </div>
              </div>
            )}

            {/* Desktop Sticky Column Header (only on lg+ after scrolling past table header) */}
            {showStickyColumnHeader && filteredTree.length > 0 && (
              <div className="hidden lg:block pb-2">
                <div
                  className={`${DESKTOP_GRID_COLS} px-5 py-2 bg-[#F4F0E6]/95 border border-[#E2DCD0] rounded-xl text-[11.5px] font-semibold tracking-[0.015em] text-[#5B6678]`}
                >
                  <div className="pl-[46px] text-huyen-lam">
                    Công việc &amp; Hạng mục
                  </div>
                  <div className="text-huyen-lam">Trạng thái</div>
                  <div>Người phụ trách</div>
                  <div>Bước tiếp theo</div>
                  <div className="text-right">Hạn xử lý</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Screen Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <h1 className="text-[22px] sm:text-[26px] font-bold text-huyen-lam tracking-[-0.02em] leading-tight">
              Danh sách công việc
            </h1>
            <span
              className="hidden sm:inline-block h-[2px] w-6 bg-chu-sa/75 rounded-full"
              aria-hidden="true"
            />
          </div>
          <p className="text-xs sm:text-[13.5px] text-[#5E697A] mt-1 tabular-nums">
            <span className="font-semibold text-huyen-lam">
              {parentTasks.length}
            </span>{' '}
            đầu việc cha{' '}
            <span className="text-[#C8C0B0] mx-1" aria-hidden="true">
              ·
            </span>{' '}
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
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl border border-[#DDD6C7] bg-trang-nga text-huyen-lam text-xs sm:text-[13px] font-medium hover:bg-[#F4F0E6] hover:border-[#CCC3B0] transition-colors whitespace-nowrap min-h-[42px]"
            >
              {allExpanded ? (
                <>
                  <ChevronsDownUp className="w-4 h-4 shrink-0 text-[#667285]" />
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
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-huyen-lam text-trang-nga text-sm font-semibold hover:bg-lam-tri-tue shadow-[0_1px_2px_rgba(20,36,63,0.14)] transition-colors whitespace-nowrap shrink-0 min-h-[42px]"
            >
              <Plus className="w-4 h-4 shrink-0 text-kim-quang" />
              <span>{isManager ? 'Thêm đầu việc' : 'Thêm việc con'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Luminous Warm Search & Filter Bar */}
      <div
        ref={filterBarRef}
        className="bg-trang-nga border border-[#E5DFD2] rounded-2xl p-3 sm:p-4 space-y-3 shadow-[0_1px_3px_rgba(20,36,63,0.03)]"
      >
        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
          <div className="relative flex-1 min-w-0">
            <Search className="w-4 h-4 text-[#8A94A3] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm theo mã, tên việc, người phụ trách, bước tiếp theo..."
              aria-label="Tìm kiếm công việc"
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
            className={`w-full px-3 py-2 text-[13px] rounded-xl border focus:outline-none focus:ring-2 focus:ring-lam-sang/30 min-h-[42px] transition-colors ${
              statusFilter !== 'all'
                ? 'bg-lam-sang-soft border-lam-sang/40 text-huyen-lam font-medium'
                : 'bg-white border-[#E2DCD0] text-huyen-lam hover:border-[#CFC7B7]'
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

          <select
            aria-label="Lọc theo người phụ trách"
            value={assigneeFilter}
            onChange={(e) => setAssigneeFilter(e.target.value)}
            className={`w-full px-3 py-2 text-[13px] rounded-xl border focus:outline-none focus:ring-2 focus:ring-lam-sang/30 min-h-[42px] transition-colors ${
              assigneeFilter !== 'all'
                ? 'bg-minh-kim-soft border-minh-kim-border text-huyen-lam font-medium'
                : 'bg-white border-[#E2DCD0] text-huyen-lam hover:border-[#CFC7B7]'
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
                : 'bg-white border-[#E2DCD0] text-huyen-lam hover:bg-[#FAF8F3] hover:border-[#CFC7B7]'
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

      {/* Modern Zen Editorial Card-Table Hybrid Workspace */}
      <div className="space-y-3">
        {/* Desktop Editorial Column Header */}
        {filteredTree.length > 0 && (
          <div
            ref={columnHeaderRef}
            className={`hidden ${DESKTOP_GRID_COLS} px-5 py-2.5 bg-[#F4F0E6]/85 border border-[#E5DFD2] rounded-xl text-[11.5px] font-semibold tracking-[0.015em] text-[#5B6678] transition-opacity duration-150 ${
              showStickyColumnHeader ? 'lg:opacity-0' : 'lg:opacity-100'
            }`}
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
          <div className="bg-trang-nga border border-[#E5DFD2] rounded-2xl px-4 py-14 text-center space-y-3 shadow-[0_1px_3px_rgba(20,36,63,0.03)]">
            <p className="text-sm text-[#606B7D]">
              {tasks.filter((t) => !isB1TestTask(t)).length === 0
                ? 'Chưa có công việc nào trên hệ thống.'
                : 'Không tìm thấy công việc nào khớp với điều kiện lọc hiện tại.'}
            </p>
            {hasActiveFilter && (
              <button
                type="button"
                onClick={resetFilters}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-huyen-lam text-trang-nga rounded-xl hover:bg-lam-tri-tue transition-colors min-h-[42px]"
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
                  className="bg-trang-nga border border-[#E5DFD2] hover:border-[#CFC6B4] rounded-2xl overflow-hidden shadow-[0_1px_3px_rgba(20,36,63,0.03),0_6px_18px_-14px_rgba(20,36,63,0.12)] transition-[border-color,box-shadow] duration-150"
                >
                  {/* Subtle Top Category Hairline for Editorial Rhythm across 9 Groups */}
                  <div
                    aria-hidden="true"
                    className="h-[2.5px] w-full"
                    style={{
                      background: `linear-gradient(90deg, ${catTheme.accent} 0%, ${catTheme.accent}4D 42%, transparent 88%)`,
                    }}
                  />

                  {/* Parent Row */}
                  <div
                    onClick={() => onSelectTask(parent.id)}
                    className="px-3.5 py-3.5 sm:px-5 sm:py-4 bg-trang-nga hover:bg-[#FCFBF8] transition-colors cursor-pointer"
                  >
                    <div className={DESKTOP_GRID_COLS}>
                      {/* Column 1: Chevron + Quiet Archival Code + Dominant Editorial Title + Clean Metadata */}
                      <div className="flex items-start gap-2.5 min-w-0">
                        <div
                          className={`shrink-0 pt-0.5 ${
                            hasChildren
                              ? 'w-9 flex items-start justify-center'
                              : 'hidden lg:block lg:w-9'
                          }`}
                        >
                          {hasChildren && (
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
                              className="w-10 h-10 -my-1.5 flex items-center justify-center rounded-lg text-[#687385] hover:bg-[#F3EFE6] hover:text-huyen-lam transition-colors"
                            >
                              {isExpanded ? (
                                <ChevronDown className="w-4 h-4 shrink-0" />
                              ) : (
                                <ChevronRight className="w-4 h-4 shrink-0" />
                              )}
                            </button>
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          {/* Mobile (< sm) Top Row: Quiet Code Seal + Soft StatusBadge */}
                          <div className="flex sm:hidden items-center justify-between gap-2 mb-1.5">
                            <span
                              style={{
                                backgroundColor: catTheme.softBg,
                                color: catTheme.text,
                                borderColor: `${catTheme.accent}33`,
                              }}
                              className="font-mono-tabular text-[11.5px] font-bold min-w-[28px] h-6 px-2 inline-flex items-center justify-center rounded-md border shrink-0"
                            >
                              {parent.displayCode}
                            </span>
                            <StatusBadge status={parent.status} compact soft />
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
                                    borderColor: `${catTheme.accent}33`,
                                  }}
                                  className="hidden sm:inline-flex font-mono-tabular text-[11.5px] font-bold min-w-[30px] h-[25px] px-2 items-center justify-center rounded-md border shrink-0 mt-0.5"
                                >
                                  {parent.displayCode}
                                </span>
                                <span className="text-[15.5px] sm:text-[16px] font-semibold tracking-[-0.01em] text-huyen-lam group-hover:text-lam-tri-tue group-hover:underline decoration-minh-kim/75 underline-offset-4 leading-[1.42] break-words transition-colors">
                                  {parent.title}
                                </span>
                              </div>
                            </button>

                            {/* Tablet (sm..md) StatusBadge */}
                            <div className="hidden sm:block lg:hidden shrink-0 pt-0.5">
                              <StatusBadge status={parent.status} compact soft />
                            </div>
                          </div>

                          {/* Unified Unboxed Editorial Metadata Line */}
                          <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs leading-5">
                            <span
                              style={{ color: catTheme.text }}
                              className="inline-flex items-center gap-1.5 font-medium"
                            >
                              <span
                                className="w-1.5 h-1.5 rounded-[2px] shrink-0"
                                style={{ backgroundColor: catTheme.accent }}
                                aria-hidden="true"
                              />
                              <span>
                                {effCat.category || 'Chưa phân hạng mục'}
                              </span>
                            </span>

                            {totalChildrenInParent > 0 && (
                              <>
                                <span
                                  className="text-[#D4CCB9] select-none"
                                  aria-hidden="true"
                                >
                                  ·
                                </span>
                                <span className="inline-flex items-center gap-1.5 text-[#5E697A]">
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
                                    className="w-11 h-1 rounded-full bg-[#EAE5D9] overflow-hidden inline-block"
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
                              </>
                            )}

                            {parentDriveNode && (
                              <>
                                <span
                                  className="text-[#D4CCB9] select-none"
                                  aria-hidden="true"
                                >
                                  ·
                                </span>
                                {parentDriveNode}
                              </>
                            )}

                            {parent.reviewFlags.length > 0 && (
                              <>
                                <span
                                  className="text-[#D4CCB9] select-none"
                                  aria-hidden="true"
                                >
                                  ·
                                </span>
                                <span className="inline-flex items-center gap-1 font-medium text-minh-kim-ink">
                                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                  <span>Cần rà soát</span>
                                </span>
                              </>
                            )}

                            {parent.archivedAt && (
                              <>
                                <span
                                  className="text-[#D4CCB9] select-none"
                                  aria-hidden="true"
                                >
                                  ·
                                </span>
                                <span className="inline-flex items-center gap-1 text-[#6E7785]">
                                  <Archive className="w-3.5 h-3.5 shrink-0" />
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
                          soft
                          className="min-w-[108px]"
                        />
                      </div>

                      {/* Desktop Column 3: Assignees */}
                      <div className="hidden lg:block min-w-0">
                        {renderAssigneeCell(parent)}
                      </div>

                      {/* Desktop Column 4: Next Step */}
                      <div
                        className="hidden lg:block min-w-0 text-[13px] leading-[1.45]"
                        title={parent.nextStep ?? ''}
                      >
                        {parent.nextStep ? (
                          <span className="line-clamp-2 break-words text-[#4D596B]">
                            {parent.nextStep}
                          </span>
                        ) : (
                          <span className="text-[#D6D0C4] select-none">—</span>
                        )}
                      </div>

                      {/* Desktop Column 5: Due Date */}
                      <div className="hidden lg:block">
                        {renderDueDateCell(parent, true)}
                      </div>
                    </div>

                    {/* Mobile (< lg) Parent Meta */}
                    <div
                      className={`lg:hidden mt-2.5 pt-2 border-t border-[#EFEAE0] space-y-1.5 ${
                        hasChildren ? 'pl-11' : ''
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                        <div className="min-w-0 flex-1">
                          {renderAssigneeCell(parent)}
                        </div>
                        {parent.dueDate && (
                          <div className="shrink-0 text-xs text-[#6E7785] flex items-center gap-1">
                            <span>Hạn:</span>
                            {renderDueDateCell(parent, false)}
                          </div>
                        )}
                      </div>
                      {parent.nextStep && (
                        <div className="text-[13px] text-[#4D596B] leading-[1.45] break-words">
                          <span className="text-[#8A94A3] font-medium">
                            Tiếp theo:{' '}
                          </span>
                          {parent.nextStep}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Nested Child Rows (Warm Linen Well, Hairline Separators) */}
                  {isExpanded && (
                    <div className="border-t border-[#ECE7DA] bg-[#FAF8F2]/85 divide-y divide-[#EFEAE0]">
                      {children.map((child) => {
                        const childDriveNode = renderDriveLinkAction(child);

                        return (
                          <div
                            key={child.id}
                            onClick={() => onSelectTask(child.id)}
                            className="px-3.5 py-2.5 sm:px-5 sm:py-3 hover:bg-trang-nga transition-colors cursor-pointer"
                          >
                            <div className={DESKTOP_GRID_COLS}>
                              {/* Column 1: Indented Tree Connector + Clean Code + Readable Child Title */}
                              <div className="flex items-start gap-2.5 min-w-0">
                                <div className="shrink-0 w-9 sm:w-12 flex items-start justify-end pr-0.5 pt-1">
                                  <CornerDownRight
                                    className="w-3.5 h-3.5 shrink-0 opacity-50"
                                    style={{ color: catTheme.accent }}
                                    aria-hidden="true"
                                  />
                                </div>

                                <div className="flex-1 min-w-0">
                                  {/* Mobile (< sm) Top Strip: Child Code + Soft Status */}
                                  <div className="flex sm:hidden items-center justify-between gap-2 mb-1">
                                    <span
                                      style={{ color: catTheme.text }}
                                      className="font-mono-tabular text-[11.5px] font-semibold opacity-90 shrink-0"
                                    >
                                      {child.displayCode}
                                    </span>
                                    <StatusBadge
                                      status={child.status}
                                      compact
                                      soft
                                    />
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
                                          className="hidden sm:inline-block font-mono-tabular text-[11.5px] font-semibold opacity-85 shrink-0"
                                        >
                                          {child.displayCode}
                                        </span>
                                        <span className="text-[13.75px] sm:text-[14px] font-medium text-[#1E2E4A] group-hover:text-lam-tri-tue group-hover:underline decoration-minh-kim/65 underline-offset-4 leading-[1.45] break-words transition-colors">
                                          {child.title}
                                        </span>
                                      </div>
                                    </button>

                                    {/* Tablet (sm..md) StatusBadge */}
                                    <div className="hidden sm:block lg:hidden shrink-0 pt-0.5">
                                      <StatusBadge
                                        status={child.status}
                                        compact
                                        soft
                                      />
                                    </div>
                                  </div>

                                  {(childDriveNode ||
                                    child.reviewFlags.length > 0 ||
                                    child.archivedAt) && (
                                    <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs leading-5">
                                      {childDriveNode}
                                      {child.reviewFlags.length > 0 && (
                                        <>
                                          {childDriveNode && (
                                            <span
                                              className="text-[#D4CCB9] select-none"
                                              aria-hidden="true"
                                            >
                                              ·
                                            </span>
                                          )}
                                          <span className="inline-flex items-center gap-1 font-medium text-minh-kim-ink">
                                            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                            <span>Cần rà soát</span>
                                          </span>
                                        </>
                                      )}
                                      {child.archivedAt && (
                                        <>
                                          {(childDriveNode ||
                                            child.reviewFlags.length > 0) && (
                                            <span
                                              className="text-[#D4CCB9] select-none"
                                              aria-hidden="true"
                                            >
                                              ·
                                            </span>
                                          )}
                                          <span className="inline-flex items-center gap-1 text-[#6E7785]">
                                            <Archive className="w-3.5 h-3.5 shrink-0" />
                                            <span>Đã lưu trữ</span>
                                          </span>
                                        </>
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
                                  soft
                                  className="min-w-[108px]"
                                />
                              </div>

                              {/* Desktop Column 3: Child Assignees */}
                              <div className="hidden lg:block min-w-0">
                                {renderAssigneeCell(child)}
                              </div>

                              {/* Desktop Column 4: Child Next Step */}
                              <div
                                className="hidden lg:block min-w-0 text-[13px] leading-[1.45]"
                                title={child.nextStep ?? ''}
                              >
                                {child.nextStep ? (
                                  <span className="line-clamp-2 break-words text-[#4D596B]">
                                    {child.nextStep}
                                  </span>
                                ) : (
                                  <span className="text-[#D6D0C4] select-none">
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
                                  <div className="shrink-0 text-xs text-[#6E7785] flex items-center gap-1">
                                    <span>Hạn:</span>
                                    {renderDueDateCell(child, false)}
                                  </div>
                                )}
                              </div>
                              {child.nextStep && (
                                <div className="text-[13px] text-[#4D596B] leading-[1.45] break-words">
                                  <span className="text-[#8A94A3] font-medium">
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
      <div className="pt-1 flex flex-wrap items-center justify-between gap-2 text-xs sm:text-[13px] text-[#606B7D]">
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
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-[#5E697A] hover:text-huyen-lam hover:bg-[#EFEAE0] transition-colors min-h-[40px]"
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
