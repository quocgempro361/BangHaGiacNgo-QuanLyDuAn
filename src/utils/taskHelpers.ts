import {
  CategoryItem,
  DocumentLink,
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

export function isTaskManagerRole(member: ProjectMember): boolean {
  return (
    member.isActive &&
    (member.role === 'admin' || member.role === 'moderator')
  );
}

/**
 * Strictly UID-based task edit check (never uses text display names for permissions).
 */
export function canUserEditTask(
  member: ProjectMember,
  task: TaskItem
): boolean {
  if (!member.isActive) return false;
  if (isTaskManagerRole(member)) return true;
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
  if (isTaskManagerRole(member)) return true;
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
  if (isTaskManagerRole(member)) return true;
  if (!member.canApprove) return false;
  if (!task) return true;
  return (
    canUserEditTask(member, task) ||
    (task.approverUids?.includes(member.uid) ?? false)
  );
}

export function canUserCreateSubtask(member: ProjectMember): boolean {
  return (
    member.isActive &&
    (member.role === 'admin' ||
      member.role === 'moderator' ||
      member.role === 'member')
  );
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

export function isB1TestTask(
  task: Pick<TaskItem, 'id' | 'isTestRecord'>
): boolean {
  if (task.id.startsWith('tbhgn_')) return false;
  return (
    Boolean(task.isTestRecord) ||
    task.id.startsWith('b1_test_') ||
    task.id.startsWith('test_task_')
  );
}

export interface ResolvedAssigneeMember {
  uid: string;
  displayName: string;
  isActive: boolean;
}

export interface ResolvedTaskAssignees {
  assignedMembers: ResolvedAssigneeMember[];
  unknownUidCount: number;
  isCollectiveGroup: boolean;
  isUnlinkedAccount: boolean;
  isUnassigned: boolean;
  labels: string[];
  displayText: string;
  searchText: string;
}

/**
 * Single authoritative Project Display Name source for daily UI.
 * Reads `/users/{uid}.displayName` directly (falls back to email local-part only if empty).
 */
export function getOfficialMemberDisplayName(
  member: Pick<ProjectMember, 'displayName' | 'email'>
): string {
  const dn = (member.displayName ?? '').trim();
  if (dn) return dn;
  const prefix = (member.email ?? '').split('@')[0]?.trim();
  return prefix || 'Thành viên';
}

/**
 * Resolves task assignees strictly from `task.assigneeUids` matched against loaded project members.
 * Never surfaces legacy spreadsheet names (`task.assignees` personal aliases) or raw UIDs in daily UI.
 * Collective `"Nhóm"` tags render distinctly as `Việc nhóm`.
 */
export function resolveTaskAssignees(
  task: Pick<TaskItem, 'assigneeUids' | 'assignees'>,
  members: Array<
    Pick<ProjectMember, 'uid' | 'displayName' | 'email' | 'isActive'>
  > = []
): ResolvedTaskAssignees {
  const uniqueUids = Array.from(
    new Set((task.assigneeUids ?? []).filter(Boolean))
  );
  const rawAssignees = (task.assignees ?? [])
    .map((a) => a.trim())
    .filter(Boolean);

  const isCollectiveGroup = rawAssignees.some(
    (a) => a.toLowerCase() === 'nhóm'
  );
  const hasLegacyPersonalAlias = rawAssignees.some(
    (a) => a.toLowerCase() !== 'nhóm'
  );

  const memberByUid = new Map(members.map((m) => [m.uid, m]));
  const assignedMembers: ResolvedAssigneeMember[] = [];
  let unknownUidCount = 0;

  for (const uid of uniqueUids) {
    const m = memberByUid.get(uid);
    if (m) {
      assignedMembers.push({
        uid: m.uid,
        displayName: getOfficialMemberDisplayName(m),
        isActive: m.isActive,
      });
    } else {
      unknownUidCount++;
    }
  }

  const isUnlinkedAccount = uniqueUids.length === 0 && hasLegacyPersonalAlias;
  const isUnassigned =
    uniqueUids.length === 0 && !hasLegacyPersonalAlias && !isCollectiveGroup;

  const labels: string[] = [];
  for (const am of assignedMembers) {
    labels.push(am.isActive ? am.displayName : `${am.displayName} (Đã khóa)`);
  }
  if (unknownUidCount > 0) {
    labels.push(
      unknownUidCount === 1
        ? 'Tài khoản không xác định'
        : `Tài khoản không xác định (${unknownUidCount})`
    );
  }
  if (isUnlinkedAccount) {
    labels.push('Chưa liên kết tài khoản');
  }
  if (isCollectiveGroup) {
    labels.push('Việc nhóm');
  }
  if (labels.length === 0) {
    labels.push('Chưa phân công');
  }

  const displayText = labels.join(', ');
  const searchText = [
    ...assignedMembers.map((am) => am.displayName),
    isCollectiveGroup ? 'Việc nhóm Nhóm' : '',
    isUnlinkedAccount ? 'Chưa liên kết tài khoản' : '',
    isUnassigned ? 'Chưa phân công' : '',
    unknownUidCount > 0 ? 'Tài khoản không xác định' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return {
    assignedMembers,
    unknownUidCount,
    isCollectiveGroup,
    isUnlinkedAccount,
    isUnassigned,
    labels,
    displayText,
    searchText,
  };
}

export const MAX_LINKS_PER_GROUP = 20;

const GENERIC_DOCUMENT_LABELS = new Set([
  '',
  'mở tài liệu',
  'tài liệu',
  'link',
  'url',
  'tài liệu chưa đặt tên',
]);

export function isGenericDocumentLabel(
  label: string | null | undefined
): boolean {
  const normalized = (label ?? '').trim().toLowerCase();
  return GENERIC_DOCUMENT_LABELS.has(normalized);
}

export function getDocumentDisplayLabel(
  link: Pick<DocumentLink, 'label'>
): { text: string; isPlaceholder: boolean } {
  const trimmed = (link.label ?? '').trim();
  if (isGenericDocumentLabel(trimmed)) {
    return { text: 'Tài liệu chưa đặt tên', isPlaceholder: true };
  }
  return { text: trimmed, isPlaceholder: false };
}

export function getDocumentSourceLabel(
  url: string | null | undefined
): string {
  const trimmed = (url ?? '').trim();
  if (!trimmed) return 'Chưa gắn đường dẫn';
  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    const path = parsed.pathname.toLowerCase();
    if (host === 'docs.google.com') {
      if (path.startsWith('/document')) return 'Google Docs';
      if (path.startsWith('/spreadsheets')) return 'Google Sheets';
      if (path.startsWith('/presentation')) return 'Google Slides';
      if (path.startsWith('/forms')) return 'Google Forms';
      return 'Google Docs';
    }
    if (host === 'drive.google.com') {
      return 'Google Drive';
    }
    return host || 'Liên kết ngoài';
  } catch {
    return 'Liên kết ngoài';
  }
}

export function validateHttpUrl(
  rawUrl: string
): { ok: true; normalizedUrl: string } | { ok: false; error: string } {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return { ok: false, error: 'Vui lòng nhập đường dẫn (URL).' };
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return {
        ok: false,
        error: 'Đường dẫn phải bắt đầu bằng http:// hoặc https://.',
      };
    }
    if (
      !parsed.hostname ||
      (!parsed.hostname.includes('.') && parsed.hostname !== 'localhost')
    ) {
      return { ok: false, error: 'Tên miền trong đường dẫn không hợp lệ.' };
    }
    return { ok: true, normalizedUrl: trimmed };
  } catch {
    return {
      ok: false,
      error: 'Đường dẫn chưa đúng định dạng URL (ví dụ: https://drive.google.com/...).',
    };
  }
}

function normalizeLinkUrlForComparison(url: string | null | undefined): string {
  const trimmed = (url ?? '').trim();
  if (!trimmed) return '';
  try {
    const parsed = new URL(trimmed);
    return `${parsed.protocol.toLowerCase()}//${parsed.host.toLowerCase()}${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return trimmed.toLowerCase();
  }
}

export function hasDuplicateUrlInGroup(
  links: DocumentLink[],
  candidateUrl: string | null | undefined,
  excludeLinkId?: string
): boolean {
  const target = normalizeLinkUrlForComparison(candidateUrl);
  if (!target) return false;
  return links.some(
    (l) =>
      l.id !== excludeLinkId &&
      normalizeLinkUrlForComparison(l.url) === target
  );
}

export function exportTasksToCSV(
  tasks: TaskItem[],
  categories: CategoryItem[] = [],
  members: Array<
    Pick<ProjectMember, 'uid' | 'displayName' | 'email' | 'isActive'>
  > = []
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
        return isGenericDocumentLabel(l.label)
          ? l.url
          : `${l.label.trim()}: ${l.url}`;
      })
      .join('; ');

  const activeTasks = tasks.filter((t) => !t.archivedAt && !isB1TestTask(t));
  const rows = activeTasks.map((t) => {
    const progress =
      t.parentId === null
        ? (() => {
            const p = computeParentProgress(t.id, activeTasks);
            return p.total > 0 ? `${p.completed}/${p.total}` : '';
          })()
        : '';
    const effCat = getEffectiveCategory(t, activeTasks, categories);
    const resolvedAssignees = resolveTaskAssignees(t, members);

    return [
      t.id,
      t.displayCode,
      t.parentId ?? '',
      t.title,
      effCat.category ?? '',
      resolvedAssignees.displayText,
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
