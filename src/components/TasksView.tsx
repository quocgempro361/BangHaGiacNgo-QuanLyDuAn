import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  CornerDownRight,
  ExternalLink,
  Plus,
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
  const isAdmin = currentUser.role === 'admin' && currentUser.isActive;
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

  const hasActiveFilter =
    searchQuery.trim() !== '' ||
    statusFilter !== 'all' ||
    categoryFilter !== 'all' ||
    assigneeFilter !== 'all' ||
    reviewOnly;

  const matchesFilter = (task: TaskItem): boolean => {
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      const hay = [
        task.displayCode,
        task.title,
        task.assignees.join(' '),
        task.nextStep ?? '',
        task.notes ?? '',
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
        if (parentMatches || matchingChildren.length > 0) {
          return {
            parent,
            children: matchingChildren.length > 0 ? matchingChildren : children,
            autoExpand: matchingChildren.length > 0,
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
    searchQuery,
    statusFilter,
    categoryFilter,
    assigneeFilter,
    reviewOnly,
    categories,
  ]);

  const toggleParent = (parentId: string) => {
    setExpandedParents((prev) => ({
      ...prev,
      [parentId]: !prev[parentId],
    }));
  };

  const resetFilters = () => {
    setSearchQuery('');
    setStatusFilter('all');
    setCategoryFilter('all');
    setAssigneeFilter('all');
    setReviewOnly(false);
  };

  return (
    <div className="space-y-4">
      {/* Header & Primary Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-[#13294B] tracking-tight">
            Danh sách công việc
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
            {parentTasks.length} đầu việc cha · Bấm mũi tên để mở hoặc thu gọn việc con
          </p>
        </div>
        {canCreate && (
          <button
            type="button"
            onClick={() => onOpenNewTask(null)}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#13294B] text-white text-sm font-medium hover:bg-[#1E3A66] transition-colors whitespace-nowrap shrink-0 min-h-[44px]"
          >
            <Plus className="w-4 h-4" />
            <span>{isAdmin ? 'Thêm đầu việc' : 'Thêm việc con'}</span>
          </button>
        )}
      </div>

      {/* Search & Filter Toolbar */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-2.5">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm theo mã, tên việc, người phụ trách..."
            className="w-full pl-9 pr-9 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#13294B] focus:bg-white min-h-[42px]"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              aria-label="Xóa tìm kiếm"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-700"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          <select
            aria-label="Lọc theo trạng thái"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#13294B] min-h-[42px]"
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
            className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#13294B] min-h-[42px]"
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
            className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#13294B] min-h-[42px]"
          >
            <option value="all">Tất cả người phụ trách</option>
            <option value="__unassigned__">Chưa phân công</option>
            {assigneeOptions.map((person) => (
              <option key={person} value={person}>
                {person}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setReviewOnly((v) => !v)}
              className={`flex-1 px-3 py-2 text-xs font-medium rounded-lg border transition-colors min-h-[42px] whitespace-nowrap ${
                reviewOnly
                  ? 'bg-[#FFF8E7] border-[#D9A84E] text-[#7C4D00]'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              Cần rà soát
            </button>
            {hasActiveFilter && (
              <button
                type="button"
                onClick={resetFilters}
                className="px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 underline whitespace-nowrap min-h-[42px]"
              >
                Xóa lọc
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Desktop Column Labels */}
      <div className="hidden lg:grid lg:grid-cols-12 gap-3 px-4 py-2 text-xs font-semibold text-slate-500 border-b border-slate-200">
        <div className="col-span-5">Đầu việc &amp; Hạng mục</div>
        <div className="col-span-2">Người phụ trách</div>
        <div className="col-span-2">Trạng thái</div>
        <div className="col-span-2">Bước tiếp theo</div>
        <div className="col-span-1 text-right">Hạn xử lý</div>
      </div>

      {/* Hierarchical Task List */}
      <div className="space-y-2.5">
        {filteredTree.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl px-4 py-10 text-center">
            <p className="text-sm text-slate-600">
              {tasks.filter((t) => !isB1TestTask(t)).length === 0
                ? 'Chưa có công việc nào trên hệ thống.'
                : 'Không tìm thấy công việc phù hợp với bộ lọc hiện tại.'}
            </p>
            {hasActiveFilter && (
              <button
                type="button"
                onClick={resetFilters}
                className="mt-3 px-4 py-2 text-sm font-medium text-[#13294B] border border-slate-200 rounded-lg hover:bg-slate-50"
              >
                Đặt lại bộ lọc
              </button>
            )}
          </div>
        ) : (
          filteredTree.map(({ parent, children, autoExpand }) => {
            const hasChildren = children.length > 0;
            const isExpanded = autoExpand || Boolean(expandedParents[parent.id]);
            const progress = computeParentProgress(parent.id, visiblePool);
            const parentOverdue = isTaskOverdue(parent);
            const parentResultLink = parent.resultLinks.find((l) => Boolean(l.url));
            const effCat = getEffectiveCategory(parent, visiblePool, categories);

            return (
              <div
                key={parent.id}
                className="bg-white border border-slate-200 rounded-xl overflow-hidden"
              >
                {/* Parent Row */}
                <div className="p-3 sm:px-4 sm:py-3.5 hover:bg-slate-50/70 transition-colors">
                  <div className="flex items-start gap-1.5 sm:gap-2 lg:grid lg:grid-cols-12 lg:items-center lg:gap-3">
                    {/* Expand button + Title */}
                    <div className="flex items-start gap-1.5 sm:gap-2 flex-1 min-w-0 lg:col-span-5">
                      {hasChildren ? (
                        <button
                          type="button"
                          onClick={() => toggleParent(parent.id)}
                          aria-expanded={isExpanded}
                          aria-label={
                            isExpanded ? 'Thu gọn việc con' : 'Mở rộng việc con'
                          }
                          className="w-10 h-10 -ml-1.5 -mt-1 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-200/70 hover:text-slate-900 shrink-0"
                        >
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                        </button>
                      ) : (
                        <span className="w-8 shrink-0" />
                      )}

                      <button
                        type="button"
                        onClick={() => onSelectTask(parent.id)}
                        className="text-left min-w-0 flex-1 group"
                      >
                        <div className="flex items-baseline gap-2">
                          <span className="font-mono-tabular text-xs font-bold text-[#13294B] shrink-0">
                            {parent.displayCode}
                          </span>
                          <span className="text-sm font-semibold text-slate-900 group-hover:text-[#13294B] group-hover:underline break-words">
                            {parent.title}
                          </span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
                          <span className="inline-flex items-center gap-1.5">
                            {effCat.color && (
                              <span
                                className="w-2 h-2 rounded-full shrink-0"
                                style={{ backgroundColor: effCat.color }}
                              />
                            )}
                            <span>{effCat.category || 'Chưa phân hạng mục'}</span>
                          </span>
                          {progress.total > 0 && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono-tabular text-[#13294B] font-medium">
                                Việc con: {progress.completed}/{progress.total}
                              </span>
                            </>
                          )}
                          {parentResultLink?.url && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="inline-flex items-center gap-1 text-[#13294B]">
                                <ExternalLink className="w-3 h-3" />
                                <span>Có liên kết KQ</span>
                              </span>
                            </>
                          )}
                          {parent.reviewFlags.length > 0 && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="inline-flex items-center gap-1 text-[#7C4D00]">
                                <AlertCircle className="w-3 h-3" />
                                <span>Cần rà soát</span>
                              </span>
                            </>
                          )}
                        </div>
                      </button>
                    </div>

                    {/* Mobile Status Right */}
                    <div className="lg:hidden shrink-0">
                      <StatusBadge status={parent.status} compact />
                    </div>

                    {/* Desktop Assignee */}
                    <div
                      onClick={() => onSelectTask(parent.id)}
                      className="hidden lg:block lg:col-span-2 text-xs text-slate-700 cursor-pointer"
                    >
                      {parent.assignees.length > 0 ? (
                        <div>
                          <div>{parent.assignees.join(', ')}</div>
                          {parent.assigneeUids.length === 0 && (
                            <div className="text-[11px] text-[#7C4D00]">
                              Chưa liên kết tài khoản
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-[#7C4D00]">Chưa phân công</span>
                      )}
                    </div>

                    {/* Desktop Status */}
                    <div
                      onClick={() => onSelectTask(parent.id)}
                      className="hidden lg:flex lg:col-span-2 items-center gap-2 cursor-pointer"
                    >
                      <StatusBadge status={parent.status} compact />
                    </div>

                    {/* Desktop Next Step */}
                    <div
                      onClick={() => onSelectTask(parent.id)}
                      className="hidden lg:block lg:col-span-2 text-xs text-slate-600 truncate cursor-pointer"
                      title={parent.nextStep ?? ''}
                    >
                      {parent.nextStep || '—'}
                    </div>

                    {/* Desktop Due Date */}
                    <div
                      onClick={() => onSelectTask(parent.id)}
                      className={`hidden lg:block lg:col-span-1 text-right text-xs font-mono-tabular cursor-pointer ${
                        parentOverdue
                          ? 'text-red-700 font-semibold'
                          : 'text-slate-600'
                      }`}
                    >
                      {formatShortDate(parent.dueDate)}
                    </div>
                  </div>

                  {/* Mobile Compact Metadata Footer */}
                  <button
                    type="button"
                    onClick={() => onSelectTask(parent.id)}
                    className="lg:hidden w-full text-left pl-8 mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-600"
                  >
                    <span>
                      {parent.assignees.length > 0 ? (
                        <>
                          {parent.assignees.join(', ')}
                          {parent.assigneeUids.length === 0 && (
                            <span className="text-[#7C4D00]">
                              {' '}
                              (Chưa liên kết tài khoản)
                            </span>
                          )}
                        </>
                      ) : (
                        'Chưa phân công'
                      )}
                    </span>
                    {parent.nextStep && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-slate-700 break-words">{parent.nextStep}</span>
                      </>
                    )}
                    {parent.dueDate && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span
                          className={`font-mono-tabular ${
                            parentOverdue ? 'text-red-700 font-semibold' : ''
                          }`}
                        >
                          Hạn: {formatShortDate(parent.dueDate)}
                        </span>
                      </>
                    )}
                  </button>
                </div>

                {/* Child Tasks */}
                {hasChildren && isExpanded && (
                  <div className="border-t border-slate-100 bg-slate-50/50 divide-y divide-slate-100">
                    {children.map((child) => {
                      const childOverdue = isTaskOverdue(child);
                      const childResultLink = child.resultLinks.find((l) => Boolean(l.url));
                      return (
                        <button
                          key={child.id}
                          type="button"
                          onClick={() => onSelectTask(child.id)}
                          className="w-full text-left px-3 py-3 sm:px-4 hover:bg-slate-100/70 transition-colors block"
                        >
                          <div className="flex items-start gap-2 lg:grid lg:grid-cols-12 lg:items-center lg:gap-3">
                            <div className="flex items-start gap-2 flex-1 min-w-0 pl-2 sm:pl-6 lg:col-span-5">
                              <CornerDownRight className="w-3.5 h-3.5 text-slate-400 mt-1 shrink-0" />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-baseline gap-2">
                                  <span className="font-mono-tabular text-xs font-semibold text-slate-600 shrink-0">
                                    {child.displayCode}
                                  </span>
                                  <span className="text-sm text-slate-800 break-words">
                                    {child.title}
                                  </span>
                                </div>
                                {(child.reviewFlags.length > 0 || childResultLink?.url) && (
                                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]">
                                    {childResultLink?.url && (
                                      <span className="inline-flex items-center gap-1 text-[#13294B]">
                                        <ExternalLink className="w-3 h-3 shrink-0" />
                                        <span>Có liên kết KQ</span>
                                      </span>
                                    )}
                                    {child.reviewFlags.length > 0 && (
                                      <span className="inline-flex items-center gap-1 text-[#7C4D00]">
                                        <AlertCircle className="w-3 h-3 shrink-0" />
                                        <span>Cần rà soát dữ liệu</span>
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Mobile Status */}
                            <div className="lg:hidden shrink-0">
                              <StatusBadge status={child.status} compact />
                            </div>

                            {/* Desktop Assignee */}
                            <div className="hidden lg:block lg:col-span-2 text-xs text-slate-700">
                              {child.assignees.length > 0 ? (
                                <div>
                                  <div>{child.assignees.join(', ')}</div>
                                  {child.assigneeUids.length === 0 && (
                                    <div className="text-[11px] text-[#7C4D00]">
                                      Chưa liên kết tài khoản
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <span className="text-[#7C4D00]">
                                  Chưa phân công
                                </span>
                              )}
                            </div>

                            {/* Desktop Status */}
                            <div className="hidden lg:block lg:col-span-2">
                              <StatusBadge status={child.status} compact />
                            </div>

                            {/* Desktop Next Step */}
                            <div
                              className="hidden lg:block lg:col-span-2 text-xs text-slate-600 truncate"
                              title={child.nextStep ?? ''}
                            >
                              {child.nextStep || '—'}
                            </div>

                            {/* Desktop Due Date */}
                            <div
                              className={`hidden lg:block lg:col-span-1 text-right text-xs font-mono-tabular ${
                                childOverdue
                                  ? 'text-red-700 font-semibold'
                                  : 'text-slate-600'
                              }`}
                            >
                              {formatShortDate(child.dueDate)}
                            </div>
                          </div>

                          {/* Mobile Child Metadata */}
                          <div className="lg:hidden pl-7 sm:pl-11 mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
                            <span
                              className={
                                child.assignees.length === 0
                                  ? 'text-[#7C4D00]'
                                  : ''
                              }
                            >
                              {child.assignees.length > 0 ? (
                                <>
                                  {child.assignees.join(', ')}
                                  {child.assigneeUids.length === 0 && (
                                    <span className="text-[#7C4D00]">
                                      {' '}
                                      (Chưa liên kết tài khoản)
                                    </span>
                                  )}
                                </>
                              ) : (
                                'Chưa phân công'
                              )}
                            </span>
                            {child.nextStep && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="text-slate-700 break-words">
                                  {child.nextStep}
                                </span>
                              </>
                            )}
                            {child.dueDate && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span
                                  className={`font-mono-tabular ${
                                    childOverdue ? 'text-red-700 font-semibold' : ''
                                  }`}
                                >
                                  Hạn: {formatShortDate(child.dueDate)}
                                </span>
                              </>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Subtle Archive Toggle Footer */}
      <div className="pt-2 flex items-center justify-between text-xs text-slate-500">
        <span>Hiển thị {filteredTree.length} đầu việc cha</span>
        <button
          type="button"
          onClick={() => setShowArchived((v) => !v)}
          className="px-2 py-2 hover:text-slate-800 underline min-h-[38px]"
        >
          {showArchived ? 'Ẩn việc đã lưu trữ' : 'Xem việc đã lưu trữ'}
        </button>
      </div>
    </div>
  );
};
