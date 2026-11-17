import {
  CategoryItem,
  ProjectMember,
  ReviewFlag,
  TaskItem,
  TaskStatus,
} from '../types/project';

export interface StatusStyleMeta {
  label: string;
  bg: string;
  text: string;
  border: string;
}

/** Strictly the 5 core workflow statuses */
export const ALL_STATUSES: TaskStatus[] = [
  'Đang làm',
  'Chờ duyệt',
  'Tạm dừng',
  'Hoàn thành',
  'Chưa bắt đầu',
];

export const STATUS_META: Record<TaskStatus, StatusStyleMeta> = {
  'Đang làm': {
    label: 'Đang làm',
    bg: '#BDD7EE',
    text: '#103A5C',
    border: '#9CC2E5',
  },
  'Chờ duyệt': {
    label: 'Chờ duyệt',
    bg: '#FFE699',
    text: '#5C4300',
    border: '#E8C868',
  },
  'Tạm dừng': {
    label: 'Tạm dừng',
    bg: '#FFC7CE',
    text: '#6B111C',
    border: '#F0A4AE',
  },
  'Hoàn thành': {
    label: 'Hoàn thành',
    bg: '#A9D08E',
    text: '#1E4612',
    border: '#8BBC6B',
  },
  'Chưa bắt đầu': {
    label: 'Chưa bắt đầu',
    bg: '#EDEDED',
    text: '#404040',
    border: '#D4D4D4',
  },
};

/** Display-only badge style when source task.status is null */
export const UNSET_STATUS_META: StatusStyleMeta = {
  label: 'Cần rà soát',
  bg: '#FFF8E7',
  text: '#7C4D00',
  border: '#D9A84E',
};

export function getStatusMeta(status: TaskStatus | null): StatusStyleMeta {
  if (!status) return UNSET_STATUS_META;
  return STATUS_META[status] ?? UNSET_STATUS_META;
}

export const REVIEW_FLAG_LABELS: Record<ReviewFlag, string> = {
  missing_assignee: 'Thiếu người phụ trách',
  missing_status: 'Thiếu trạng thái (null)',
  missing_hyperlink_url: 'Thiếu URL Drive thực',
};

export function computeParentProgress(
  parentId: string,
  tasks: TaskItem[]
): { completed: number; total: number; percentage: number } {
  const children = tasks.filter(
    (t) => t.parentId === parentId && !t.archivedAt
  );
  const total = children.length;
  const completed = children.filter((c) => c.status === 'Hoàn thành').length;
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
  return { completed, total, percentage };
}

export function isTaskOverdue(task: TaskItem, referenceDate?: Date): boolean {
  if (!task.dueDate || task.status === 'Hoàn thành' || task.archivedAt) {
    return false;
  }
  const now = referenceDate ? new Date(referenceDate) : new Date();
  const todayStr = now.toISOString().slice(0, 10);
  return task.dueDate < todayStr;
}

/**
 * Enforces max 2 levels and prevents circular parent-child relationships.
 */
export function canBeParent(
  candidateParentId: string | null,
  targetTaskId: string | null,
  tasks: TaskItem[]
): { ok: boolean; reason?: string } {
  if (!candidateParentId) {
    return { ok: true };
  }
  if (targetTaskId && candidateParentId === targetTaskId) {
    return { ok: false, reason: 'Không thể chọn chính công việc này làm việc cha.' };
  }
  const parent = tasks.find((t) => t.id === candidateParentId);
  if (!parent) {
    return { ok: false, reason: 'Không tìm thấy công việc cha.' };
  }
  if (parent.parentId !== null) {
    return {
      ok: false,
      reason: 'V1 chỉ hỗ trợ tối đa 2 cấp (việc con không thể có việc con).',
    };
  }
  if (parent.archivedAt) {
    return {
      ok: false,
      reason: 'Không thể thêm việc con vào nhóm đã lưu trữ.',
    };
  }
  if (targetTaskId) {
    const targetHasChildren = tasks.some(
      (t) => t.parentId === targetTaskId && !t.archivedAt
    );
    if (targetHasChildren) {
      return {
        ok: false,
        reason: 'Công việc đang có việc con, không thể chuyển thành việc con của nhóm khác.',
      };
    }
  }
  return { ok: true };
}

export function getEffectiveCategory(
  task: TaskItem,
  tasks: TaskItem[],
  categories: CategoryItem[] = []
): {
  categoryId: string | null;
  category: string;
  color?: string;
  isActive?: boolean;
  inherited: boolean;
} {
  const resolveByIdOrName = (
    catId: string | null | undefined,
    catName: string | null | undefined,
    inherited: boolean
  ) => {
    if (catId) {
      const matched = categories.find((c) => c.id === catId);
      if (matched) {
        return {
          categoryId: matched.id,
          category: matched.name,
          color: matched.color,
          isActive: matched.isActive,
          inherited,
        };
      }
      return {
        categoryId: catId,
        category: catName || catId,
        inherited,
      };
    }
    if (catName) {
      const matched = categories.find(
        (c) => c.name.toLowerCase() === catName.toLowerCase()
      );
      return {
        categoryId: matched?.id ?? null,
        category: matched?.name ?? catName,
        color: matched?.color,
        isActive: matched?.isActive,
        inherited,
      };
    }
    return null;
  };

  const own = resolveByIdOrName(task.categoryId, task.category, false);
  if (own) return own;

  if (task.parentId) {
    const parent = tasks.find((t) => t.id === task.parentId);
    if (parent) {
      const fromParent = resolveByIdOrName(
        parent.categoryId,
        parent.category,
        true
      );
      if (fromParent) return fromParent;
    }
  }

  return { categoryId: null, category: '', inherited: false };
}

/**
 * Strictly UID-based task edit check (never uses text display names for permissions).
 */
export function canUserEditTask(
  member: ProjectMember,
  task: TaskItem
): boolean {
  if (!member.isActive) return false;
  if (member.role === 'admin') return true;
  if (member.role === 'viewer') return false;
  return task.assigneeUids.includes(member.uid);
}

/**
 * Checks if user can create a child task under a given parent task.
 */
export function canUserCreateSubtaskInParent(
  member: ProjectMember,
  parentTask: TaskItem
): boolean {
  if (!member.isActive || parentTask.parentId !== null || parentTask.archivedAt) {
    return false;
  }
  if (member.role === 'admin') return true;
  if (member.role === 'member') {
    return parentTask.assigneeUids.includes(member.uid);
  }
  return false;
}

export function canUserApproveTask(
  member: ProjectMember,
  task?: TaskItem
): boolean {
  if (!member.isActive) return false;
  if (member.role === 'admin') return true;
  if (!member.canApprove) return false;
  if (!task) return true;
  return (
    canUserEditTask(member, task) ||
    (task.approverUids?.includes(member.uid) ?? false)
  );
}

export function canUserCreateSubtask(member: ProjectMember): boolean {
  return member.isActive && (member.role === 'admin' || member.role === 'member');
}

export function formatShortDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d);
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return 'Chưa có cập nhật';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

export function exportTasksToCSV(
  tasks: TaskItem[],
  categories: CategoryItem[] = []
): string {
  const headers = [
    'ID',
    'STT',
    'ParentID',
    'Tên đầu việc',
    'Hạng mục',
    'Người thực hiện',
    'Trạng thái hiện tại',
    'Bước tiếp theo',
    'Hạn xử lý',
    'Cập nhật gần nhất',
    'Tiến độ việc con',
    'Tài liệu phục vụ nghiên cứu',
    'Kết quả nghiên cứu hiện tại (link)',
    'Ghi chú',
    'Cờ rà soát',
  ];

  const escapeCsv = (val: string) => {
    const safe = val.replace(/"/g, '""');
    return /[",\n]/.test(safe) ? `"${safe}"` : safe;
  };

  const formatLinksForCsv = (links: TaskItem['resultLinks']) =>
    links
      .map((l) => {
        if (!l.url) return `${l.label} [Chưa có URL]`;
        return l.label === 'Mở tài liệu' ? l.url : `${l.label}: ${l.url}`;
      })
      .join('; ');

  const activeTasks = tasks.filter((t) => !t.archivedAt);
  const rows = activeTasks.map((t) => {
    const progress =
      t.parentId === null
        ? (() => {
            const p = computeParentProgress(t.id, tasks);
            return p.total > 0 ? `${p.completed}/${p.total}` : '';
          })()
        : '';
    const effCat = getEffectiveCategory(t, tasks, categories);

    return [
      t.id,
      t.displayCode,
      t.parentId ?? '',
      t.title,
      effCat.category ?? '',
      t.assignees.join(', '),
      t.status ?? '',
      t.nextStep ?? '',
      t.dueDate ?? '',
      t.updatedAt ?? '',
      progress,
      formatLinksForCsv(t.referenceLinks),
      formatLinksForCsv(t.resultLinks),
      t.notes ?? '',
      t.reviewFlags.join('; '),
    ]
      .map(escapeCsv)
      .join(',');
  });

  return '\uFEFF' + [headers.map(escapeCsv).join(','), ...rows].join('\n');
}
