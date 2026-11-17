import {
  CategoryItem,
  DocumentLink,
  ProjectMember,
  ReviewFlag,
  TaskCategory,
  TaskItem,
  TaskStatus,
} from '../types/project';

export const OFFICIAL_IMPORT_JSON_PATH = '/api/admin/official-import-source';

export const REQUIRED_TBHGN_CATEGORIES: Array<{
  id: string;
  name: string;
  color: string;
  sortOrder: number;
}> = [
  {
    id: 'cat_outline',
    name: 'Đề cương',
    color: '#13294B',
    sortOrder: 1,
  },
  {
    id: 'cat_foundation',
    name: 'Nền tảng & quy chuẩn',
    color: '#1E5631',
    sortOrder: 2,
  },
  {
    id: 'cat_research',
    name: 'Truy nguồn & nghiên cứu',
    color: '#8A5A00',
    sortOrder: 3,
  },
];

export interface OfficialImportSourceTask {
  id: string;
  displayCode: string;
  parentId: string | null;
  sortOrder: number;
  title: string;
  category: TaskCategory | null;
  assignees: string[];
  assigneeUids: string[];
  status: TaskStatus | null;
  nextStep: string | null;
  dueDate: string | null;
  lastCheckedAt?: string | null;
  notes: string | null;
  referenceLinks: DocumentLink[];
  resultLinks: DocumentLink[];
  reviewFlags: ReviewFlag[];
  version: number;
  updatedAt: string | null;
  updatedBy: string | null;
  archivedAt: string | null;
  archivedBy: string | null;
  migrationSourceRow?: number;
}

export interface OfficialImportDataset {
  dataset: string;
  schemaVersion: string;
  source: {
    kind: string;
    fileName: string;
    spreadsheetUrl: string;
    tab: string;
    rows: string;
    linkColumn: string;
  };
  qualityNotes: string[];
  counts: {
    tasks: number;
    parents: number;
    children: number;
    tasksWithRecoveredRealUrls: number;
    missingAssignee: number;
    missingStatus: number;
    missingHyperlinkUrl: number;
  };
  tasks: OfficialImportSourceTask[];
}

export type OfficialTaskConflictStatus =
  | 'ready'
  | 'duplicate_id'
  | 'code_conflict';

export interface NormalizedOfficialTaskData {
  id: string;
  displayCode: string;
  parentId: string | null;
  sortOrder: number;
  title: string;
  categoryId: string | null;
  category: TaskCategory | null;
  assignees: string[];
  assigneeUids: string[];
  status: TaskStatus | null;
  nextStep: string | null;
  dueDate: string | null;
  notes: string | null;
  referenceLinks: DocumentLink[];
  resultLinks: DocumentLink[];
  reviewFlags: ReviewFlag[];
  version: number;
  archivedAt: null;
  archivedBy: null;
  isTestRecord: false;
}

export interface OfficialImportPlanItem {
  source: OfficialImportSourceTask;
  normalizedPayload: NormalizedOfficialTaskData;
  effectiveCategoryId: string | null;
  effectiveCategoryName: string;
  categoryInherited: boolean;
  categoryMatchedInFirestore: boolean;
  conflictStatus: OfficialTaskConflictStatus;
  conflictDetail: string | null;
  willWriteInB22: boolean;
}

export interface OfficialImportCategoryStatus {
  requiredName: string;
  defaultId: string;
  firestoreCategoryId: string | null;
  existsInFirestore: boolean;
  isActiveInFirestore: boolean;
}

export type OfficialImportReadiness =
  | 'ready'
  | 'needs_categories'
  | 'partially_imported'
  | 'already_imported'
  | 'has_conflicts';

export interface OfficialImportSummary {
  totalTasks: number;
  parentCount: number;
  childCount: number;
  groupProgress: {
    tbhgn_3: { completed: number; total: number };
    tbhgn_4: { completed: number; total: number };
    tbhgn_5: { completed: number; total: number };
  };
  statusCounts: {
    inProgress: number;
    pendingApproval: number;
    paused: number;
    completed: number;
    notStarted: number;
    unsetNull: number;
  };
  preservedResultUrlCount: number;
  tasksWithResultLinksCount: number;
  missingAssigneeTasks: OfficialImportPlanItem[];
  missingStatusTasks: OfficialImportPlanItem[];
  missingHyperlinkTasks: OfficialImportPlanItem[];
  flaggedTasks: OfficialImportPlanItem[];
  duplicateIdCount: number;
  codeConflictCount: number;
  readyToImportCount: number;
  existingFirestoreTaskCount: number;
  existingTestRecordCount: number;
  categoryStatuses: OfficialImportCategoryStatus[];
  missingRequiredCategories: string[];
  inactiveRequiredCategories: string[];
  readiness: OfficialImportReadiness;
  readinessLabel: string;
  readinessDescription: string;
}

export function parseOfficialJsonDataset(raw: unknown): OfficialImportDataset {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Dữ liệu JSON nguồn TBHGN không hợp lệ.');
  }
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.tasks) || obj.tasks.length === 0) {
    throw new Error('File JSON nguồn không chứa danh sách công việc (tasks).');
  }
  return obj as unknown as OfficialImportDataset;
}

export async function loadOfficialJsonDataset(
  idToken?: string,
  signal?: AbortSignal
): Promise<OfficialImportDataset> {
  const headers: Record<string, string> = {};
  if (idToken) {
    headers.Authorization = `Bearer ${idToken}`;
  }
  const response = await fetch(OFFICIAL_IMPORT_JSON_PATH, {
    cache: 'no-store',
    headers,
    signal,
  });
  if (!response.ok) {
    throw new Error(
      `Không thể tải dữ liệu JSON nguồn (${response.status} ${response.statusText}).`
    );
  }
  const json: unknown = await response.json();
  return parseOfficialJsonDataset(json);
}

function normalizeName(val: string): string {
  return val.trim().toLowerCase();
}

function findMatchingFirestoreCategory(
  categoryName: string,
  existingCategories: CategoryItem[]
): CategoryItem | null {
  const target = normalizeName(categoryName);
  const activeMatch = existingCategories.find(
    (c) => c.isActive && normalizeName(c.name) === target
  );
  if (activeMatch) return activeMatch;
  return existingCategories.find((c) => normalizeName(c.name) === target) ?? null;
}

export function buildOfficialImportPlan(
  dataset: OfficialImportDataset,
  existingTasks: TaskItem[],
  existingCategories: CategoryItem[]
): {
  items: OfficialImportPlanItem[];
  summary: OfficialImportSummary;
} {
  const sourceTasks = [...dataset.tasks].sort(
    (a, b) => a.sortOrder - b.sortOrder
  );
  const sourceById = new Map(sourceTasks.map((t) => [t.id, t]));
  const existingById = new Map(existingTasks.map((t) => [t.id, t]));
  const existingByCode = new Map<string, TaskItem[]>();

  for (const t of existingTasks) {
    if (t.archivedAt) continue;
    const codeKey = t.displayCode.trim();
    const list = existingByCode.get(codeKey) ?? [];
    list.push(t);
    existingByCode.set(codeKey, list);
  }

  const categoryStatuses: OfficialImportCategoryStatus[] =
    REQUIRED_TBHGN_CATEGORIES.map((req) => {
      const matched = findMatchingFirestoreCategory(
        req.name,
        existingCategories
      );
      return {
        requiredName: req.name,
        defaultId: req.id,
        firestoreCategoryId: matched?.id ?? null,
        existsInFirestore: Boolean(matched),
        isActiveInFirestore: matched ? matched.isActive : false,
      };
    });

  const resolveExplicitCategory = (
    catName: string | null
  ): {
    categoryId: string | null;
    categoryName: string | null;
    matchedInFirestore: boolean;
  } => {
    if (!catName) {
      return { categoryId: null, categoryName: null, matchedInFirestore: true };
    }
    const matched = findMatchingFirestoreCategory(catName, existingCategories);
    if (matched) {
      return {
        categoryId: matched.id,
        categoryName: matched.name,
        matchedInFirestore: true,
      };
    }
    const fallback = REQUIRED_TBHGN_CATEGORIES.find(
      (c) => normalizeName(c.name) === normalizeName(catName)
    );
    return {
      categoryId: fallback?.id ?? null,
      categoryName: catName,
      matchedInFirestore: false,
    };
  };

  const items: OfficialImportPlanItem[] = sourceTasks.map((src) => {
    const resolvedOwn = resolveExplicitCategory(src.category);
    let effectiveCategoryId = resolvedOwn.categoryId;
    let effectiveCategoryName = resolvedOwn.categoryName ?? '';
    let categoryInherited = false;
    let categoryMatchedInFirestore = resolvedOwn.matchedInFirestore;

    if (!resolvedOwn.categoryName && src.parentId) {
      const parentSrc = sourceById.get(src.parentId);
      if (parentSrc?.category) {
        const resolvedParent = resolveExplicitCategory(parentSrc.category);
        effectiveCategoryId = resolvedParent.categoryId;
        effectiveCategoryName = resolvedParent.categoryName ?? '';
        categoryInherited = true;
        categoryMatchedInFirestore = resolvedParent.matchedInFirestore;
      }
    }

    // Preserve exact source arrays/labels and strip unsupported rule fields
    // (`lastCheckedAt`, `migrationSourceRow`); never fabricate UIDs or emails.
    const normalizedPayload: NormalizedOfficialTaskData = {
      id: src.id,
      displayCode: src.displayCode,
      parentId: src.parentId,
      sortOrder: src.sortOrder,
      title: src.title,
      categoryId: resolvedOwn.categoryId,
      category: resolvedOwn.categoryName,
      assignees: [...src.assignees],
      assigneeUids: [],
      status: src.status,
      nextStep: src.nextStep,
      dueDate: src.dueDate,
      notes: src.notes,
      referenceLinks: src.referenceLinks.map((l) => ({ ...l })),
      resultLinks: src.resultLinks.map((l) => ({ ...l })),
      reviewFlags: [...src.reviewFlags],
      version: 1,
      archivedAt: null,
      archivedBy: null,
      isTestRecord: false,
    };

    const dupById = existingById.get(src.id);
    const sameCodeOthers = (existingByCode.get(src.displayCode.trim()) ?? []).filter(
      (t) => t.id !== src.id
    );

    let conflictStatus: OfficialTaskConflictStatus = 'ready';
    let conflictDetail: string | null = null;

    if (dupById) {
      conflictStatus = 'duplicate_id';
      conflictDetail = `ID "${src.id}" đã tồn tại trên Firestore (mã ${dupById.displayCode}) — sẽ bỏ qua, không ghi đè.`;
    } else if (sameCodeOthers.length > 0) {
      conflictStatus = 'code_conflict';
      conflictDetail = `Mã "${src.displayCode}" đang được dùng bởi bản ghi khác (${sameCodeOthers
        .map((t) => t.id)
        .join(', ')}).`;
    }

    return {
      source: src,
      normalizedPayload,
      effectiveCategoryId,
      effectiveCategoryName,
      categoryInherited,
      categoryMatchedInFirestore,
      conflictStatus,
      conflictDetail,
      willWriteInB22: conflictStatus === 'ready',
    };
  });

  const parentCount = items.filter((i) => i.source.parentId === null).length;
  const childCount = items.filter((i) => i.source.parentId !== null).length;

  const countGroup = (parentId: string) => {
    const children = items.filter((i) => i.source.parentId === parentId);
    const completed = children.filter(
      (i) => i.source.status === 'Hoàn thành'
    ).length;
    return { completed, total: children.length };
  };

  const preservedResultUrlCount = items.reduce(
    (sum, item) =>
      sum + item.source.resultLinks.filter((l) => Boolean(l.url)).length,
    0
  );
  const tasksWithResultLinksCount = items.filter((item) =>
    item.source.resultLinks.some((l) => Boolean(l.url))
  ).length;

  const missingAssigneeTasks = items.filter((i) =>
    i.source.reviewFlags.includes('missing_assignee')
  );
  const missingStatusTasks = items.filter((i) =>
    i.source.reviewFlags.includes('missing_status')
  );
  const missingHyperlinkTasks = items.filter((i) =>
    i.source.reviewFlags.includes('missing_hyperlink_url')
  );
  const flaggedTasks = items.filter((i) => i.source.reviewFlags.length > 0);

  const duplicateIdCount = items.filter(
    (i) => i.conflictStatus === 'duplicate_id'
  ).length;
  const codeConflictCount = items.filter(
    (i) => i.conflictStatus === 'code_conflict'
  ).length;
  const readyToImportCount = items.filter(
    (i) => i.conflictStatus === 'ready'
  ).length;

  const existingTestRecordCount = existingTasks.filter(
    (t) => Boolean(t.isTestRecord) || t.id.startsWith('b1_test_') || t.id.startsWith('test_task_')
  ).length;

  const missingRequiredCategories = categoryStatuses
    .filter((c) => !c.existsInFirestore)
    .map((c) => c.requiredName);
  const inactiveRequiredCategories = categoryStatuses
    .filter((c) => c.existsInFirestore && !c.isActiveInFirestore)
    .map((c) => c.requiredName);

  let readiness: OfficialImportReadiness = 'ready';
  let readinessLabel = 'Sẵn sàng nhập dữ liệu chính thức (B2.2)';
  let readinessDescription =
    '20 đầu việc, 13 URL thực và 3 hạng mục chuẩn đã hợp lệ theo lược đồ Firestore và không có xung đột. Admin có thể thực hiện nhập chính thức vào Firestore.';

  if (duplicateIdCount === items.length) {
    readiness = 'already_imported';
    readinessLabel = 'Đã có đủ 20/20 đầu việc chính thức trên Firestore';
    readinessDescription =
      'Tất cả 20 ID tbhgn_* đã tồn tại trên Firestore. Cơ chế idempotent sẽ bỏ qua toàn bộ để không tạo trùng hoặc ghi đè.';
  } else if (codeConflictCount > 0) {
    readiness = 'has_conflicts';
    readinessLabel = 'Phát hiện xung đột mã hiển thị — Đã chặn nhập';
    readinessDescription = `Có ${codeConflictCount} công việc trùng mã hiển thị với bản ghi khác đang hoạt động trên Firestore. Cần kiểm tra trước khi nhập, không tự ghi đè.`;
  } else if (
    missingRequiredCategories.length > 0 ||
    inactiveRequiredCategories.length > 0
  ) {
    readiness = 'needs_categories';
    readinessLabel = 'Cần khởi tạo đủ 3 hạng mục TBHGN trên Firestore';
    readinessDescription =
      'Vui lòng mở mục "Quản lý hạng mục" để khởi tạo/kích hoạt đủ 3 hạng mục chuẩn trước khi chạy nhập dữ liệu chính thức B2.2.';
  } else if (duplicateIdCount > 0) {
    readiness = 'partially_imported';
    readinessLabel = 'Có bản ghi đã tồn tại — Sẵn sàng nhập bổ sung phần thiếu';
    readinessDescription = `Đã có ${duplicateIdCount} đầu việc trên Firestore (sẽ giữ nguyên không ghi đè) và ${readyToImportCount} đầu việc mới sẵn sàng nhập.`;
  }

  return {
    items,
    summary: {
      totalTasks: items.length,
      parentCount,
      childCount,
      groupProgress: {
        tbhgn_3: countGroup('tbhgn_3'),
        tbhgn_4: countGroup('tbhgn_4'),
        tbhgn_5: countGroup('tbhgn_5'),
      },
      statusCounts: {
        inProgress: items.filter((i) => i.source.status === 'Đang làm').length,
        pendingApproval: items.filter((i) => i.source.status === 'Chờ duyệt')
          .length,
        paused: items.filter((i) => i.source.status === 'Tạm dừng').length,
        completed: items.filter((i) => i.source.status === 'Hoàn thành').length,
        notStarted: items.filter((i) => i.source.status === 'Chưa bắt đầu')
          .length,
        unsetNull: items.filter((i) => i.source.status === null).length,
      },
      preservedResultUrlCount,
      tasksWithResultLinksCount,
      missingAssigneeTasks,
      missingStatusTasks,
      missingHyperlinkTasks,
      flaggedTasks,
      duplicateIdCount,
      codeConflictCount,
      readyToImportCount,
      existingFirestoreTaskCount: existingTasks.length,
      existingTestRecordCount,
      categoryStatuses,
      missingRequiredCategories,
      inactiveRequiredCategories,
      readiness,
      readinessLabel,
      readinessDescription,
    },
  };
}

/**
 * Produces the exact Firestore document payloads for one official TBHGN task
 * + its atomic initial activityLog. Keeps `isTestRecord: false`, `assigneeUids: []`,
 * and strips JSON-only metadata (`lastCheckedAt`, `migrationSourceRow`) so
 * Firestore Security Rules `isValidTask` passes cleanly.
 */
export function buildOfficialTaskFirestoreWritePayloads(
  item: OfficialImportPlanItem,
  adminUser: ProjectMember,
  timestampToken: unknown,
  logSuffix: string
) {
  const actorDisplayName = (
    adminUser.displayName ||
    adminUser.sheetAlias ||
    adminUser.email ||
    'Admin'
  )
    .trim()
    .slice(0, 120);

  const p = item.normalizedPayload;
  const taskPayload = {
    id: p.id,
    displayCode: p.displayCode,
    parentId: p.parentId,
    sortOrder: p.sortOrder,
    title: p.title,
    categoryId: p.categoryId,
    category: p.category,
    assignees: [...p.assignees],
    assigneeUids: [] as string[],
    status: p.status,
    nextStep: p.nextStep,
    dueDate: p.dueDate,
    notes: p.notes,
    referenceLinks: p.referenceLinks.map((l) => ({ ...l })),
    resultLinks: p.resultLinks.map((l) => ({ ...l })),
    reviewFlags: [...p.reviewFlags],
    version: 1,
    updatedAt: timestampToken,
    updatedBy: actorDisplayName,
    updatedByUid: adminUser.uid,
    archivedAt: null,
    archivedBy: null,
    isTestRecord: false,
  };

  const logId = `import_b2_${p.id}_${logSuffix}`;
  const logPayload = {
    id: logId,
    taskId: p.id,
    actorUid: adminUser.uid,
    actorName: actorDisplayName,
    action: 'create' as const,
    summary: `Nhập dữ liệu chính thức TBHGN từ nguồn JSON (${p.displayCode})`,
    createdAt: timestampToken,
  };

  return {
    taskId: p.id,
    logId,
    taskPayload,
    logPayload,
  };
}

export interface OfficialImportVerification {
  verifiedAt: string;
  officialCount: number;
  parentCount: number;
  childCount: number;
  groupProgress: {
    tbhgn_3: { completed: number; total: number };
    tbhgn_4: { completed: number; total: number };
    tbhgn_5: { completed: number; total: number };
  };
  statusCounts: {
    inProgress: number;
    pendingApproval: number;
    paused: number;
    completed: number;
    notStarted: number;
    unsetNull: number;
  };
  resultUrlCount: number;
  nonEmptyAssigneeUidCount: number;
  wrongTestFlagCount: number;
  b1TestTaskCount: number;
  missingIds: string[];
  mismatches: string[];
  allChecksPassed: boolean;
}

export interface OfficialImportExecutionResult {
  importedCount: number;
  skippedIds: string[];
  errorCount: number;
  verification: OfficialImportVerification;
}

export function validateOfficialImportPreflight(
  items: OfficialImportPlanItem[],
  summary: OfficialImportSummary
): { ok: boolean; errors: string[] } {
  const errors: string[] = [];

  if (items.length !== 20 || summary.parentCount !== 9 || summary.childCount !== 11) {
    errors.push(
      `Dữ liệu nguồn phải đúng 20 công việc (9 cha, 11 con); hiện đọc được ${items.length} (${summary.parentCount} cha, ${summary.childCount} con).`
    );
  }
  if (summary.preservedResultUrlCount !== 13) {
    errors.push(
      `Dữ liệu nguồn phải có đúng 13 URL thực trong resultLinks; hiện đọc được ${summary.preservedResultUrlCount}.`
    );
  }
  if (summary.missingRequiredCategories.length > 0) {
    errors.push(
      `Thiếu hạng mục bắt buộc trên Firestore: ${summary.missingRequiredCategories.join(', ')}.`
    );
  }
  if (summary.inactiveRequiredCategories.length > 0) {
    errors.push(
      `Hạng mục bắt buộc đang tạm ẩn trên Firestore: ${summary.inactiveRequiredCategories.join(', ')}.`
    );
  }
  if (summary.codeConflictCount > 0) {
    const conflicts = items
      .filter((i) => i.conflictStatus === 'code_conflict')
      .map((i) => `${i.source.displayCode} (${i.source.id})`)
      .join(', ');
    errors.push(
      `Phát hiện ${summary.codeConflictCount} xung đột mã hiển thị với bản ghi đang hoạt động: ${conflicts}.`
    );
  }

  return { ok: errors.length === 0, errors };
}

export function computeOfficialFirestoreVerification(
  allServerTasks: TaskItem[],
  expectedIds: string[]
): OfficialImportVerification {
  const expectedSet = new Set(expectedIds);
  const officialTasks = allServerTasks.filter((t) => expectedSet.has(t.id));
  const foundSet = new Set(officialTasks.map((t) => t.id));
  const missingIds = expectedIds.filter((id) => !foundSet.has(id));

  const parentCount = officialTasks.filter((t) => t.parentId === null).length;
  const childCount = officialTasks.filter((t) => t.parentId !== null).length;

  const groupProg = (parentId: string) => {
    const children = officialTasks.filter(
      (t) => t.parentId === parentId && !t.archivedAt
    );
    return {
      completed: children.filter((c) => c.status === 'Hoàn thành').length,
      total: children.length,
    };
  };

  const groupProgress = {
    tbhgn_3: groupProg('tbhgn_3'),
    tbhgn_4: groupProg('tbhgn_4'),
    tbhgn_5: groupProg('tbhgn_5'),
  };

  const statusCounts = {
    inProgress: officialTasks.filter((t) => t.status === 'Đang làm').length,
    pendingApproval: officialTasks.filter((t) => t.status === 'Chờ duyệt')
      .length,
    paused: officialTasks.filter((t) => t.status === 'Tạm dừng').length,
    completed: officialTasks.filter((t) => t.status === 'Hoàn thành').length,
    notStarted: officialTasks.filter((t) => t.status === 'Chưa bắt đầu').length,
    unsetNull: officialTasks.filter((t) => t.status === null).length,
  };

  const resultUrlCount = officialTasks.reduce(
    (sum, t) => sum + t.resultLinks.filter((l) => Boolean(l.url)).length,
    0
  );

  const nonEmptyAssigneeUidCount = officialTasks.filter(
    (t) => t.assigneeUids.length > 0
  ).length;
  const wrongTestFlagCount = officialTasks.filter(
    (t) => t.isTestRecord !== false
  ).length;

  const b1TestTaskCount = allServerTasks.filter(
    (t) =>
      !expectedSet.has(t.id) &&
      (Boolean(t.isTestRecord) ||
        t.id.startsWith('b1_test_') ||
        t.id.startsWith('test_task_'))
  ).length;

  const mismatches: string[] = [];
  if (officialTasks.length !== 20) {
    mismatches.push(`Tổng việc chính thức đọc lại là ${officialTasks.length}/20.`);
  }
  if (parentCount !== 9 || childCount !== 11) {
    mismatches.push(`Cấu trúc cha-con đọc lại là ${parentCount} cha / ${childCount} con (kỳ vọng 9/11).`);
  }
  if (
    groupProgress.tbhgn_3.total !== 2 ||
    groupProgress.tbhgn_4.total !== 5 ||
    groupProgress.tbhgn_5.total !== 4
  ) {
    mismatches.push(
      `Số việc con của 3 nhóm là ${groupProgress.tbhgn_3.completed}/${groupProgress.tbhgn_3.total}, ${groupProgress.tbhgn_4.completed}/${groupProgress.tbhgn_4.total}, ${groupProgress.tbhgn_5.completed}/${groupProgress.tbhgn_5.total}.`
    );
  }
  if (resultUrlCount !== 13) {
    mismatches.push(`Số URL resultLinks đọc lại là ${resultUrlCount}/13.`);
  }
  if (
    statusCounts.inProgress !== 7 ||
    statusCounts.pendingApproval !== 2 ||
    statusCounts.paused !== 10 ||
    statusCounts.unsetNull !== 1
  ) {
    mismatches.push(
      `Trạng thái đọc lại: ${statusCounts.inProgress} Đang làm, ${statusCounts.pendingApproval} Chờ duyệt, ${statusCounts.paused} Tạm dừng, ${statusCounts.unsetNull} null.`
    );
  }
  if (wrongTestFlagCount > 0) {
    mismatches.push(`Có ${wrongTestFlagCount} việc chính thức bị đánh dấu isTestRecord=true.`);
  }

  return {
    verifiedAt: new Date().toISOString(),
    officialCount: officialTasks.length,
    parentCount,
    childCount,
    groupProgress,
    statusCounts,
    resultUrlCount,
    nonEmptyAssigneeUidCount,
    wrongTestFlagCount,
    b1TestTaskCount,
    missingIds,
    mismatches,
    allChecksPassed: mismatches.length === 0 && missingIds.length === 0,
  };
}
